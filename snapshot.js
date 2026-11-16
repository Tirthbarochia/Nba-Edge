// Budgeted sportsbook refresh. Visitors only ever read the copy saved in Supabase; this
// module decides when a new copy may be bought from The Odds API and records what it cost.
//
// Rules (all configurable through server environment variables):
//   ODDS_REFRESHES_PER_DAY      full-slate refreshes allowed per Eastern day (default 1)
//   ODDS_REFRESH_MINUTES        minimum spacing between refreshes (default 60)
//   ODDS_FIRST_REFRESH_HOUR_ET  no refresh before this Eastern hour (default 11)
//   ODDS_SCANNER_DAILY_CREDITS  daily credits the signed-in Odds scanner may spend (default 10)
// A refresh is skipped when the provider's last reported remaining credits cannot cover it.
import { db } from './store.js';
import { upcoming, quotes, MAX_EVENT_COST } from './market-feed.js';
import { generate, pickKey } from './insight-engine.js';

const whole = (value, fallback, min, max) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const settings = () => ({
  perDay: whole(process.env.ODDS_REFRESHES_PER_DAY, 1, 0, 48),
  minutes: whole(process.env.ODDS_REFRESH_MINUTES, 60, 10, 1440),
  startHour: whole(process.env.ODDS_FIRST_REFRESH_HOUR_ET, 11, 0, 23),
  scanner: whole(process.env.ODDS_SCANNER_DAILY_CREDITS, 10, 0, 100000)
});
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

async function refresh(date, day, now) {
  const mine = await claim(day, {last_started: iso(now), refreshes: day.refreshes + 1});
  if (!mine) return;
  let spent = 0;
  const skip = note => patch(date, {refreshes: day.refreshes, note});
  try {
    const games = await upcoming(date, now);
    if (!games.length) return await skip('no-games');
    const [latest] = await db('GET', 'odds_days', {query:{select:'credits_remaining', credits_remaining:'not.is.null', order:'usage_at.desc', limit:'1'}});
    if (latest && latest.credits_remaining < games.length * MAX_EVENT_COST) return await skip('allowance');
    const results = await Promise.allSettled(games.map(g => quotes(g.id)));
    const good = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!good.length) return await skip('provider');
    spent = good.reduce((sum, r) => sum + (r.usage.last ?? (r.rows.length ? MAX_EVENT_COST : 0)), 0);
    const known = key => good.map(r => r.usage[key]).filter(v => v !== null);
    const remaining = known('remaining').length ? Math.min(...known('remaining')) : null;
    const used = known('used').length ? Math.max(...known('used')) : null;
    const fetched = iso(Date.now());
    const row = (g, i) => ({slate_date:date, event_id:g.id, home:g.home_team, away:g.away_team, tip:g.commence_time,
      ok: results[i].status === 'fulfilled', rows: results[i].status === 'fulfilled' ? results[i].value.rows : [], fetched_at: fetched});
    const all = games.map(row), saved = all.filter(r => r.ok), failed = all.filter(r => !r.ok);
    await db('POST', 'odds_events', {query:{on_conflict:'slate_date,event_id'}, body:saved, prefer:'resolution=merge-duplicates,return=minimal'});
    // A failed game must not erase a copy saved by an earlier refresh.
    if (failed.length) await db('POST', 'odds_events', {query:{on_conflict:'slate_date,event_id'}, body:failed, prefer:'resolution=ignore-duplicates,return=minimal'});
    await patch(date, {fetched_at:fetched, games:games.length, covered:saved.length, credits_spent:day.credits_spent + spent,
      note:null, insights_at:null, insights_started:null,
      ...(remaining === null ? {} : {credits_remaining:remaining, credits_used:used, usage_at:fetched})});
  } catch {
    // Credits already spent stay counted; a refresh that cost nothing may be retried later.
    await patch(date, spent ? {note:'provider'} : {refreshes: day.refreshes, note:'provider'}).catch(() => {});
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
  if (process.env.ODDS_API_KEY && due(day, now, s)) {
    day ||= await openDay(date);
    if (due(day, now, s)) { await refresh(date, day, now); day = await getDay(date); }
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
