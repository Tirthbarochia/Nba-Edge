// Budgeted sportsbook refresh. Visitors only ever read the copy saved in Supabase; this
// module decides when a new copy may be fetched from a provider and records what it cost.
//
// Sources: SportsGameOdds is used first when SPORTSGAMEODDS_API_KEY is set (billed one object
// per game returned). The Odds API is the backup (billed up to three credits per game).
//
// Rules (all configurable through server environment variables):
//   SGO_REFRESHES_PER_DAY       refreshes per Eastern day when SportsGameOdds is set (default 8)
//   SGO_MONTHLY_OBJECTS         SportsGameOdds objects allowed per rolling 30 days (default 2500)
//   ODDS_REFRESHES_PER_DAY      refreshes per day that may use The Odds API (default 1)
//   ODDS_REFRESH_MINUTES        minimum spacing between refreshes (default 90 with SportsGameOdds, else 60)
//   ODDS_FIRST_REFRESH_HOUR_ET  no refresh before this Eastern hour (default 10 with SportsGameOdds, else 11)
//   ODDS_SCANNER_DAILY_CREDITS  daily credits the signed-in Odds scanner may spend (default 10)
import { db } from './store.js';
import { upcoming, quotes, MAX_EVENT_COST } from './market-feed.js';
import { sgoSlate } from './sgo-feed.js';
import { generate, pickKey, normalize } from './insight-engine.js';

const whole = (value, fallback, min, max) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const settings = () => {
  const sgo = Boolean(process.env.SPORTSGAMEODDS_API_KEY), backupPerDay = whole(process.env.ODDS_REFRESHES_PER_DAY, 1, 0, 48);
  return {
    sgo, backupPerDay,
    perDay: sgo ? whole(process.env.SGO_REFRESHES_PER_DAY, 8, 0, 48) : backupPerDay,
    monthly: whole(process.env.SGO_MONTHLY_OBJECTS, 2500, 0, 10000000),
    minutes: whole(process.env.ODDS_REFRESH_MINUTES, sgo ? 90 : 60, 10, 1440),
    startHour: whole(process.env.ODDS_FIRST_REFRESH_HOUR_ET, sgo ? 10 : 11, 0, 23),
    scanner: whole(process.env.ODDS_SCANNER_DAILY_CREDITS, 10, 0, 100000)
  };
};
// The largest NBA slate is 15 games, so this much room must remain before a SportsGameOdds call.
const MAX_SLATE = 15;
const hourET = now => Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', hour:'numeric', hourCycle:'h23'}).format(new Date(now)));
const iso = ms => new Date(ms).toISOString();
const today = date => ({slate_date: 'eq.' + date});

async function getDay(date) {
  return (await db('GET', 'odds_days', {query: today(date)}))[0] || null;
}
async function openDay(date) {
  await db('POST', 'odds_days', {query:{on_conflict:'slate_date'}, body:{slate_date:date}, prefer:'resolution=ignore-duplicates,return=minimal'});
  return getDay(date);
}
// Optimistic lock: succeeds for exactly one caller holding the current row version.
async function claim(day, changes) {
  const rows = await db('PATCH', 'odds_days', {
    query:{...today(day.slate_date), version:'eq.' + day.version},
    body:{...changes, version: day.version + 1}, prefer:'return=representation'
  });
  return rows[0] || null;
}
const patch = (date, changes) => db('PATCH', 'odds_days', {query: today(date), body: changes, prefer:'return=minimal'});

export function due(day, now, s = settings()) {
  if (hourET(now) < s.startHour || (day?.refreshes || 0) >= s.perDay) return false;
  return !day?.last_started || now - Date.parse(day.last_started) >= s.minutes * 60000;
}

// The same game must keep one id whichever provider supplied it.
const gameId = (away, home) => normalize(away) + '-at-' + normalize(home);

async function sgoRoom(date, s) {
  const from = new Date(Date.parse(date + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
  const rows = await db('GET', 'odds_days', {query:{select:'sgo_objects', slate_date:'gte.' + from}});
  return s.monthly - rows.reduce((sum, r) => sum + (r.sgo_objects || 0), 0);
}

async function oddsApiSlate(date, now) {
  const games = await upcoming(date, now);
  if (!games.length) return {games:[], credits:0, remaining:null, used:null};
  const refuse = (quota, message) => { const error = Error(message); error.quota = quota; throw error; };
  // Trust a saved "remaining credits" figure for a day only; after that the allowance may have reset.
  const [latest] = await db('GET', 'odds_days', {query:{select:'credits_remaining,usage_at', credits_remaining:'not.is.null', order:'usage_at.desc', limit:'1'}});
  if (latest && now - Date.parse(latest.usage_at) < 86400000 && latest.credits_remaining < games.length * MAX_EVENT_COST) refuse(true, 'Allowance too low');
  const results = await Promise.allSettled(games.map(g => quotes(g.id)));
  const good = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  if (!good.length) refuse(results.some(r => r.reason?.quota), 'Provider unavailable');
  const known = key => good.map(r => r.usage[key]).filter(v => v !== null);
  return {
    games: games.map((g, i) => ({home:g.home_team, away:g.away_team, tip:g.commence_time, ok:results[i].status === 'fulfilled', rows:results[i].status === 'fulfilled' ? results[i].value.rows : []})),
    credits: good.reduce((sum, r) => sum + (r.usage.last ?? (r.rows.length ? MAX_EVENT_COST : 0)), 0),
    remaining: known('remaining').length ? Math.min(...known('remaining')) : null,
    used: known('used').length ? Math.max(...known('used')) : null
  };
}

async function refresh(date, day, now, s) {
  const mine = await claim(day, {last_started: iso(now), refreshes: day.refreshes + 1});
  if (!mine) return;
  let slate = null, source = null, note = 'provider', objects = 0, credits = 0;
  const withLines = () => Boolean(slate) && slate.games.some(g => g.ok);
  // A refresh that cost something stays counted, so a failing provider cannot be retried in a loop.
  const stop = why => patch(date, {note:why, sgo_objects:(day.sgo_objects || 0) + objects, refreshes: day.refreshes + (objects || credits ? 1 : 0)});
  try {
    if (s.sgo) {
      if (await sgoRoom(date, s) < MAX_SLATE) note = 'allowance';
      else try { slate = await sgoSlate(date, now); objects = slate.objects; source = 'sgo'; }
      catch (error) { if (error?.quota) note = 'allowance'; else console.warn('sgo-refresh', String(error?.message || error).slice(0,160)); }
      if (slate?.games.length && !withLines()) console.warn('sgo-refresh', 'games returned without player lines');
    }
    const empty = slate && !slate.games.length;
    if (!empty && !withLines() && process.env.ODDS_API_KEY && (day.backup_refreshes || 0) < s.backupPerDay) {
      try { slate = await oddsApiSlate(date, now); credits = slate.credits; source = 'odds-api'; }
      catch (error) { if (error?.quota) note = 'allowance'; else console.warn('odds-refresh', String(error?.message || error).slice(0,160)); }
    }
    if (!slate) return await stop(note);
    if (!slate.games.length) return await stop('no-games');
    if (!withLines()) return await stop('no-lines');
    const fetched = iso(Date.now());
    const all = slate.games.map(g => ({slate_date:date, event_id:gameId(g.away, g.home), home:g.home, away:g.away, tip:g.tip, ok:g.ok, rows:g.rows, fetched_at:fetched}));
    const saved = all.filter(r => r.ok), failed = all.filter(r => !r.ok);
    await db('POST', 'odds_events', {query:{on_conflict:'slate_date,event_id'}, body:saved, prefer:'resolution=merge-duplicates,return=minimal'});
    // A game without lines must not erase a copy saved by an earlier refresh.
    if (failed.length) await db('POST', 'odds_events', {query:{on_conflict:'slate_date,event_id'}, body:failed, prefer:'resolution=ignore-duplicates,return=minimal'});
    await patch(date, {fetched_at:fetched, games:all.length, covered:saved.length, source, note:null, insights_at:null, insights_started:null,
      sgo_objects:(day.sgo_objects || 0) + objects, credits_spent:day.credits_spent + credits,
      backup_refreshes:(day.backup_refreshes || 0) + (source === 'odds-api' ? 1 : 0),
      ...(source === 'odds-api' && slate.remaining !== null ? {credits_remaining:slate.remaining, credits_used:slate.used, usage_at:fetched} : {})});
  } catch (error) {
    console.warn('refresh', String(error?.message || error).slice(0,160));
    await stop('provider').catch(() => {});
  }
}

// Builds insights from the saved snapshot. Costs no sportsbook credits, so it may be retried.
async function insights(date, day, now) {
  if (!day?.fetched_at || day.insights_at || !day.covered) return false;
  if (day.insights_started && now - Date.parse(day.insights_started) < 180000) return false;
  if (!await claim(day, {insights_started: iso(now)})) return false;
  try {
    const taken = Date.parse(day.fetched_at);
    const events = (await db('GET', 'odds_events', {query: today(date)}))
      .filter(e => e.ok && Date.parse(e.fetched_at) === taken && Date.parse(e.tip) > now);
    const picks = await generate(date, events.map(e => ({home:e.home, away:e.away, tip:e.tip, rows:e.rows})), taken);
    const earlier = await db('GET', 'insight_picks', {query:{...today(date), select:'pick_key,active,pick'}});
    const existing = new Set(earlier.map(r => r.pick_key));
    const one = pick_key => ({...today(date), pick_key:'eq.' + pick_key});
    const fresh = [], confirmed = new Set();
    for (const pick of picks) {
      const pick_key = pickKey(pick);
      confirmed.add(pick_key);
      if (existing.has(pick_key)) await db('PATCH', 'insight_picks', {query:one(pick_key), body:{pick, last_confirmed_at:day.fetched_at, active:true}, prefer:'return=minimal'});
      else fresh.push({slate_date:date, pick_key, player:pick.player, metric:pick.metric, line:pick.line, side:pick.side,
        first_pick:pick, pick, first_suggested_at:day.fetched_at, last_confirmed_at:day.fetched_at, active:true});
    }
    // Earlier suggestions are never deleted. One is marked inactive only when its game was
    // re-checked in this run and the line no longer passed; started games keep their last state.
    const checked = new Set(events.map(e => e.away + '|' + e.home));
    for (const row of earlier) {
      if (row.active && !confirmed.has(row.pick_key) && checked.has(row.pick?.away + '|' + row.pick?.home))
        await db('PATCH', 'insight_picks', {query:one(row.pick_key), body:{active:false}, prefer:'return=minimal'});
    }
    if (fresh.length) await db('POST', 'insight_picks', {query:{on_conflict:'slate_date,pick_key'}, body:fresh, prefer:'resolution=ignore-duplicates,return=minimal'});
    await patch(date, {insights_at: iso(Date.now())});
  } catch { /* insights_at stays empty, so a later request retries after three minutes */ }
  return true;
}

// Called by the public routes. Returns today's saved state after any refresh that was due.
export async function ensure(date, now = Date.now()) {
  const s = settings();
  let day = await getDay(date);
  if ((s.sgo || process.env.ODDS_API_KEY) && due(day, now, s)) {
    day ||= await openDay(date);
    if (due(day, now, s)) { await refresh(date, day, now, s); day = await getDay(date); }
  }
  if (await insights(date, day, now)) day = await getDay(date);
  const status = day?.fetched_at ? 'ready' : day?.note || (hourET(now) < s.startHour ? 'scheduled' : 'pending');
  return {day, status, startHour: s.startHour};
}

export async function slate(date, now = Date.now()) {
  const events = await db('GET', 'odds_events', {query:{...today(date), select:'event_id,home,away,tip,ok,fetched_at', order:'tip.asc'}});
  return events.filter(e => Date.parse(e.tip) > now);
}
export async function eventRows(date, event) {
  return (await db('GET', 'odds_events', {query:{...today(date), event_id:'eq.' + event, select:'rows,tip,fetched_at'}}))[0] || null;
}
export async function savedPicks(date) {
  return db('GET', 'insight_picks', {query:{...today(date), order:'first_suggested_at.asc'}});
}

// Signed-in Odds scanner: a small separate daily allowance, recorded against the same day row.
export async function scannerDay(date) {
  const day = await getDay(date) || await openDay(date);
  return day && day.scanner_credits < settings().scanner ? day : null;
}
export async function scannerSpent(day, usage) {
  const cost = usage.last ?? 1;
  for (let attempt = 0; day && attempt < 2; attempt++) {
    const changes = {scanner_credits: day.scanner_credits + cost,
      ...(usage.remaining === null ? {} : {credits_remaining:usage.remaining, credits_used:usage.used, usage_at:iso(Date.now())})};
    if (await claim(day, changes)) return;
    day = await getDay(day.slate_date);
  }
}
