// Walk-forward backtest of the matchup projection (projection.js) on past seasons.
// Every player-game is projected using only games played before it: the player's own earlier
// games, each team's points, rebounds and assists allowed before that date, and which regular
// teammates sat out (a teammate counts as out when he played for the team both before and after
// the game but not in it, a stand-in for the injury report). Nothing after tip-off is used.
//
// Data format (compact ESPN game logs): {players: {id: {name, games: [[event, date, team,
// opponent, home(1/0), minutes, points, rebounds, assists], ...]}}}
import { projectAll, lineChance, STATS } from '../projection.js';
import { estimate } from '../line-estimate.js';

const EV = 0, DATE = 1, TEAM = 2, OPP = 3, HOME = 4, MIN = 5;
const COL = {points: 6, rebounds: 7, assists: 8};
const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; };

// Indexes built once per season: team-game totals, what each team allowed by date, and who played.
export function prepare(season) {
  const teamGames = new Map();           // event|team -> {date, team, opp, totals, players:Set}
  const byPlayer = [];
  for (const [id, p] of Object.entries(season.players || {})) {
    const games = p.games.filter(g => g[MIN] > 0).sort((a, b) => a[DATE].localeCompare(b[DATE]));
    if (!games.length) continue;
    byPlayer.push({id, name: p.name, games});
    for (const g of games) {
      const key = g[EV] + '|' + g[TEAM];
      const tg = teamGames.get(key) || {event: g[EV], date: g[DATE], team: g[TEAM], opp: g[OPP], points: 0, rebounds: 0, assists: 0, players: new Map()};
      for (const s of STATS) tg[s] += g[COL[s]];
      tg.players.set(id, g[MIN]);
      teamGames.set(key, tg);
    }
  }
  // Allowed per team: the opponent's totals in each of the team's games, in date order.
  const allowed = new Map(), league = [];
  for (const tg of teamGames.values()) {
    const against = teamGames.get(tg.event + '|' + tg.opp);
    if (!against) continue;
    const list = allowed.get(tg.team) || [];
    list.push({date: tg.date, points: against.points, rebounds: against.rebounds, assists: against.assists});
    allowed.set(tg.team, list);
    league.push({date: tg.date, points: tg.points, rebounds: tg.rebounds, assists: tg.assists});
  }
  const prefix = list => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const dates = list.map(x => x.date), sums = {points: [0], rebounds: [0], assists: [0]};
    for (const x of list) for (const s of STATS) sums[s].push(sums[s].at(-1) + x[s]);
    return {dates, sums};
  };
  const allowedIdx = new Map([...allowed].map(([t, l]) => [t, prefix(l)]));
  const leagueIdx = prefix(league);
  // Each player's appearances per team, for the teammates-out test.
  const roster = new Map();              // team -> Map(player -> sorted [{date, event, minutes}])
  for (const p of byPlayer) for (const g of p.games) {
    const team = roster.get(g[TEAM]) || new Map();
    const list = team.get(p.id) || [];
    list.push({date: g[DATE], event: g[EV], minutes: g[MIN]});
    team.set(p.id, list);
    roster.set(g[TEAM], team);
  }
  return {byPlayer, teamGames, allowedIdx, leagueIdx, roster};
}

function averageBefore(idx, date, stat) {
  const n = lowerBound(idx.dates, date);
  return n ? {mean: idx.sums[stat][n] / n, games: n} : null;
}

// Regular teammates (5+ games, 15+ minutes before this date) who played for the team before
// and after this game but not in it.
function teammatesOut(prep, team, playerId, event, date) {
  const tg = prep.teamGames.get(event + '|' + team);
  const out = [];
  for (const [id, apps] of prep.roster.get(team) || []) {
    if (id === playerId || tg?.players.has(id)) continue;
    const before = apps.filter(a => a.date < date);
    if (before.length < 5 || !apps.some(a => a.date > date)) continue;
    if (before.reduce((s, a) => s + a.minutes, 0) / before.length < 15) continue;
    out.push({id, first: before[0].date, played: new Set(before.map(a => a.event))});
  }
  return out;
}

const logLoss = (p, y) => -(y ? Math.log(Math.max(1e-6, p)) : Math.log(Math.max(1e-6, 1 - p)));

// Runs the projection over every qualifying player-game. Returns one row per player-game-stat.
export function walk(prep, settings = {}, {minGames = 5, minMinutes = 20} = {}) {
  const rows = [];
  for (const p of prep.byPlayer) {
    p.games.forEach((g, i) => {
      if (i < minGames) return;
      const date = g[DATE], team = g[TEAM];
      const prior = p.games.slice(0, i).filter(x => x[TEAM] === team && x[DATE] < date).reverse();
      if (prior.length < minGames) return;
      const out = teammatesOut(prep, team, p.id, g[EV], date);
      const games = prior.map(x => ({minutes: x[MIN], home: x[HOME] === 1, values: {points: x[6], rebounds: x[7], assists: x[8]},
        without: out.length > 0 && out.every(m => !m.played.has(x[EV]) && x[DATE] >= m.first)}));
      const oppIdx = prep.allowedIdx.get(g[OPP]);
      const opponents = {};
      for (const s of STATS) {
        const a = oppIdx && averageBefore(oppIdx, date, s), l = averageBefore(prep.leagueIdx, date, s);
        if (a && l && a.games >= 1) opponents[s] = {team: g[OPP], allowed: a.mean, league: l.mean, games: a.games};
      }
      const all = projectAll(games, {home: g[HOME] === 1, opponents, teammatesOut: out.map(m => m.id)}, settings);
      for (const s of STATS) {
        const m = all[s];
        // The same games are scored for every setting: rotation players (20+ minutes over their last five).
        if (!m || prior.slice(0, 5).reduce((t, x) => t + x[MIN], 0) / Math.min(5, prior.length) < minMinutes) continue;
        const values = games.map(x => x.values[s]);
        const last10 = values.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(10, values.length);
        const actual = g[COL[s]];
        const season = values.reduce((a, b) => a + b, 0) / values.length;
        // Predictive log-likelihood of the actual result (a proper score that needs no line), for
        // the model and for the same spread centred on the season and last-10 averages.
        const ll = mean => Math.log(Math.max(1e-9, lineChance({mean: Math.max(0.05, mean), dispersion: m.dispersion}, actual, 'Over')?.push || 0));
        const base = {date, stat: s, player: p.id, actual, mean: m.mean, last10, season,
          llModel: ll(m.mean), llSeason: ll(season), llLast10: ll(last10), teammatesOut: out.length > 0};
        // Lines on both sides of recent form, so neither Over nor Under is favored by construction.
        for (const line of [Math.floor(last10) + 0.5, Math.floor(last10) - 0.5].filter(l => l > 0)) {
          const proj = lineChance(m, line, 'Over');
          rows.push({...base, line, over: actual > line ? 1 : 0,
            pModel: proj ? Math.min(0.995, Math.max(0.005, proj.chance)) : 0.5,
            pOld: (estimate(games.map(x => ({value: x.values[s]})), line, 'Over') ?? 50) / 100});
        }
      }
    });
  }
  return rows;
}

// Accuracy summary for a set of rows.
export function score(rows) {
  const n = rows.length;
  if (!n) return {n: 0};
  const mean = f => rows.reduce((t, r) => t + f(r), 0) / n;
  const confident = (key, edge) => {
    const picks = rows.filter(r => Math.abs(r[key] - 0.5) >= edge);
    const wins = picks.filter(r => (r[key] > 0.5) === (r.over === 1)).length;
    return {picks: picks.length, hitRate: picks.length ? wins / picks.length : null};
  };
  const bins = Array.from({length: 10}, (_, i) => {
    const inBin = rows.filter(r => Math.min(9, Math.floor(r.pModel * 10)) === i);
    return {bin: i / 10, n: inBin.length, predicted: inBin.length ? inBin.reduce((t, r) => t + r.pModel, 0) / inBin.length : null,
      actual: inBin.length ? inBin.reduce((t, r) => t + r.over, 0) / inBin.length : null};
  }).filter(b => b.n);
  return {
    n, overRate: mean(r => r.over),
    mae: {model: mean(r => Math.abs(r.mean - r.actual)), last10: mean(r => Math.abs(r.last10 - r.actual)), season: mean(r => Math.abs(r.season - r.actual))},
    likelihood: {model: mean(r => r.llModel), season: mean(r => r.llSeason), last10: mean(r => r.llLast10)},
    brier: {model: mean(r => (r.pModel - r.over) ** 2), old: mean(r => (r.pOld - r.over) ** 2), coin: mean(r => (0.5 - r.over) ** 2)},
    logLoss: {model: mean(r => logLoss(r.pModel, r.over)), old: mean(r => logLoss(r.pOld, r.over)), coin: Math.log(2)},
    confident: {model55: confident('pModel', 0.05), model60: confident('pModel', 0.1), old55: confident('pOld', 0.05), old60: confident('pOld', 0.1)},
    calibration: bins
  };
}

export function report(rows, cutoff) {
  const pick = f => rows.filter(f);
  const out = {all: score(rows)};
  if (cutoff) { out.train = score(pick(r => r.date < cutoff)); out.test = score(pick(r => r.date >= cutoff)); }
  for (const s of STATS) out[s] = score(pick(r => r.stat === s && (!cutoff || r.date >= cutoff)));
  out.teammatesOutTest = score(pick(r => r.teammatesOut && (!cutoff || r.date >= cutoff)));
  return out;
}
