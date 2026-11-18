// Track record of every published insight. Each suggestion is graded once its game is final,
// at the line it was first suggested: Over wins above the line, Under wins below it, an exact
// tie is a push, and a player who did not play is void. Grading uses ESPN box scores only, so it
// never spends sportsbook credits.
import { db } from './store.js';
import { directory, outcome } from './player-feed.js';
import { normalize } from './insight-engine.js';

const HOUR = 3600000;
const iso = ms => new Date(ms).toISOString();
export const judge = (side, line, value) => value === line ? 'push' : (side === 'Over') === (value > line) ? 'hit' : 'miss';
// Profit in units for a one-unit stake at American odds.
export const units = (result, price) => result === 'miss' ? -1 : result !== 'hit' || !Number.isFinite(price) || !price ? 0 : price > 0 ? price / 100 : 100 / -price;

// Grades up to `limit` finished picks. Each pick is checked at most every 30 minutes, starting
// three hours after tip-off; a pick still without a box score 36 hours after tip-off is void.
export async function grade(now = Date.now(), limit = 12) {
  const open = await db('GET', 'insight_picks', {query:{result:'is.null', select:'slate_date,pick_key,player,metric,line,side,first_pick,grade_checked_at', order:'slate_date.asc', limit:'100'}});
  const ready = open.filter(r => {
    const tip = Date.parse(r.first_pick?.tip);
    return Number.isFinite(tip) && now - tip >= 3 * HOUR && (!r.grade_checked_at || now - Date.parse(r.grade_checked_at) >= 0.5 * HOUR);
  }).slice(0, limit);
  let players = null, graded = 0;
  for (const r of ready) {
    let athlete = r.first_pick.athlete, team = r.first_pick.team;
    if (!athlete || !team) {
      // Picks saved before player ids were stored: match the name once against today's rosters.
      players ||= await directory().catch(() => []);
      const found = players.filter(p => normalize(p.name) === normalize(r.player));
      if (found.length === 1) ({id: athlete, team} = found[0]);
    }
    const line = Number(r.line), late = now - Date.parse(r.first_pick.tip) >= 36 * HOUR;
    const result = athlete && team ? await outcome({player:String(athlete), team:String(team), metric:r.metric, date:String(r.slate_date)}).catch(() => null) : null;
    let changes = {grade_checked_at: iso(now)};
    if (result?.status === 'final') changes = {...changes, result: judge(r.side, line, result.value), actual: result.value, graded_at: iso(now)};
    else if (late && (!athlete || ['missing','no-game'].includes(result?.status))) changes = {...changes, result: 'void', graded_at: iso(now)};
    await db('PATCH', 'insight_picks', {query:{slate_date:'eq.' + r.slate_date, pick_key:'eq.' + r.pick_key, result:'is.null'}, body:changes, prefer:'return=minimal'});
    if (changes.result) graded++;
  }
  return graded;
}

// Summary for the page: totals, hit rate, units, current and best streak, recent days and picks.
export function summarize(rows, now = Date.now()) {
  const order = (a, b) => Date.parse(a.first_pick?.tip) - Date.parse(b.first_pick?.tip) || String(a.first_suggested_at).localeCompare(String(b.first_suggested_at)) || a.pick_key.localeCompare(b.pick_key);
  const graded = rows.filter(r => r.result).sort(order);
  const count = result => graded.filter(r => r.result === result).length;
  const hits = count('hit'), misses = count('miss');
  const decided = graded.filter(r => r.result === 'hit' || r.result === 'miss');
  let streak = null, best = 0, run = 0;
  for (const r of decided) {
    run = r.result === 'hit' ? run + 1 : 0;
    best = Math.max(best, run);
    streak = streak?.result === r.result ? {result: r.result, count: streak.count + 1} : {result: r.result, count: 1};
  }
  const days = new Map();
  for (const r of graded) {
    const day = days.get(String(r.slate_date)) || {date: String(r.slate_date), hits:0, misses:0, pushes:0, voids:0};
    day[{hit:'hits', miss:'misses', push:'pushes', void:'voids'}[r.result]]++;
    days.set(day.date, day);
  }
  return {
    hits, misses, pushes: count('push'), voids: count('void'),
    pending: rows.filter(r => !r.result && Date.parse(r.first_pick?.tip) <= now).length,
    rate: hits + misses ? hits / (hits + misses) : null,
    units: Math.round(graded.reduce((sum, r) => sum + units(r.result, Number(r.first_pick?.price)), 0) * 100) / 100,
    streak, best,
    days: [...days.values()].reverse().slice(0, 14),
    recent: graded.slice(-10).reverse().map(r => ({date: String(r.slate_date), player: r.player, metric: r.metric, line: Number(r.line), side: r.side,
      price: Number(r.first_pick?.price) || null, book: r.first_pick?.book || null, result: r.result, actual: r.actual == null ? null : Number(r.actual)}))
  };
}

export async function record(author = 'site', now = Date.now()) {
  const rows = await db('GET', 'insight_picks', {query:{author:'eq.' + author, select:'slate_date,pick_key,player,metric,line,side,first_pick,first_suggested_at,result,actual', order:'slate_date.asc'}});
  return summarize(rows, now);
}
