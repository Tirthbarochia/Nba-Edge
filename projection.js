// Matchup projection for one player and stat: an expected value adjusted for minutes and role,
// teammates who are out, home or away, and the opponent's defense, plus a spread so any line
// can be turned into a chance. Pure functions only, shared by the server and the browser.
//
// Method (each adjustment is pulled toward "no effect" when its sample is small):
// - Rate: the stat per minute, weighted toward recent games (ten-game half-life).
// - Minutes: weighted toward the last few games (three-game half-life), which tracks role changes.
// - Teammates out: when listed Out or Doubtful tonight, the rate and minutes are blended with the
//   player's games this season without them, by how many such games exist.
// - Home or away: the player's own home and away per-minute rates, heavily shrunk, capped at ±8%.
// - Opponent: what tonight's opponent allows per game in this stat against the league average,
//   shrunk by games played, capped at ±12%.
// - Spread: a negative binomial fitted to the player's game-to-game variation.
// This is a transparent rule-based projection with a handful of settings tuned by backtest.

export const STATS = ['points', 'rebounds', 'assists'];
// Settings. The backtest tunes these; see docs/backtest.md for the evidence behind each value.
export const DEFAULTS = {
  rateHalfLife: 10, minutesHalfLife: 3,
  teammates: true, teammateK: 5, teammateMinGames: 3,
  venue: true, venueK: 15, venueCap: 0.08,
  opponent: true, opponentK: 10, opponentCap: 0.12,
  dispersionFloor: 1.05, dispersionScale: 1
};
const weighted = (rows, halfLife, pick) => {
  let sum = 0, total = 0;
  rows.forEach((row, i) => { const w = 2 ** (-i / halfLife); sum += w * pick(row); total += w; });
  return total ? sum / total : null;
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const shrink = (ratio, n, k) => 1 + (ratio - 1) * n / (n + k);

// One stat. games: newest first, each {minutes, home, value, without}; `without` marks games
// played while every teammate who is out tonight was also missing.
export function projectStat(games, {home = null, opponent = null, teammatesOut = []} = {}, settings = {}) {
  const P = {...DEFAULTS, ...settings};
  const played = games.filter(g => g.minutes > 0 && Number.isFinite(g.value));
  if (played.length < 5) return null;
  const rate = weighted(played, P.rateHalfLife, g => g.value) / weighted(played, P.rateHalfLife, g => g.minutes);
  const minutes = weighted(played, P.minutesHalfLife, g => g.minutes);
  const steps = [];
  let r = rate, m = minutes;

  const without = played.filter(g => g.without);
  if (P.teammates && teammatesOut.length) {
    if (without.length >= P.teammateMinGames) {
      const lambda = without.length / (without.length + P.teammateK);
      const rw = weighted(without, P.rateHalfLife, g => g.value) / weighted(without, P.rateHalfLife, g => g.minutes);
      const mw = weighted(without, P.minutesHalfLife, g => g.minutes);
      const before = r * m;
      r = (1 - lambda) * r + lambda * rw;
      m = (1 - lambda) * m + lambda * mw;
      steps.push({key:'teammates', label:'Teammates out', change:r * m - before, detail:teammatesOut.join(', ') + ' out · ' + without.length + ' games without'});
    } else {
      steps.push({key:'teammates', label:'Teammates out', change:0, detail:teammatesOut.join(', ') + ' out · too few games without to measure (' + without.length + ')'});
    }
  }

  let base = r * m;
  if (P.venue && home !== null) {
    const side = played.filter(g => g.home === home), other = played.filter(g => g.home !== home);
    const sideRate = side.reduce((s, g) => s + g.value, 0) / Math.max(1, side.reduce((s, g) => s + g.minutes, 0));
    const allRate = played.reduce((s, g) => s + g.value, 0) / played.reduce((s, g) => s + g.minutes, 0);
    const n = Math.min(side.length, other.length);
    const factor = side.length && other.length && allRate > 0 ? clamp(shrink(sideRate / allRate, n, P.venueK), 1 - P.venueCap, 1 + P.venueCap) : 1;
    steps.push({key:'venue', label:home ? 'Home game' : 'Road game', change:base * (factor - 1), detail:side.length + ' ' + (home ? 'home' : 'road') + ' games this season'});
    base *= factor;
  }
  if (P.opponent && opponent && opponent.allowed > 0 && opponent.league > 0) {
    const factor = clamp(shrink(opponent.allowed / opponent.league, opponent.games, P.opponentK), 1 - P.opponentCap, 1 + P.opponentCap);
    steps.push({key:'opponent', label:'Opponent defense', change:base * (factor - 1), detail:opponent.team + ' allow ' + opponent.allowed.toFixed(1) + ' per game · league ' + opponent.league.toFixed(1)});
    base *= factor;
  }

  const mean = weighted(played, P.rateHalfLife, g => g.value);
  const variance = weighted(played, P.rateHalfLife, g => (g.value - mean) ** 2);
  const dispersion = Math.max(P.dispersionFloor, P.dispersionScale * (mean > 0 ? variance / mean : 1));
  return {mean: base, dispersion, rate, minutes, projectedMinutes: m, games: played.length, steps,
    baseline: rate * minutes};
}

// All three stats plus PRA (sum of the three, with the spread of the summed history).
export function projectAll(games, context = {}, settings = {}) {
  const out = {};
  for (const stat of STATS) out[stat] = projectStat(games.map(g => ({...g, value: g.values?.[stat]})), {...context, opponent: context.opponents?.[stat] || null}, settings);
  if (STATS.every(s => out[s])) {
    const sum = games.map(g => ({...g, value: STATS.reduce((t, s) => t + g.values[s], 0)}));
    const raw = projectStat(sum, {...context, opponent: null}, settings);
    const mean = STATS.reduce((t, s) => t + out[s].mean, 0);
    const steps = ['teammates', 'venue', 'opponent'].map(key => {
      const parts = STATS.map(s => out[s].steps.find(x => x.key === key)).filter(Boolean);
      return parts.length ? {key, label:parts[0].label, change:parts.reduce((t, x) => t + x.change, 0), detail:parts[0].key === 'opponent' ? 'Points, rebounds and assists allowed combined' : parts[0].detail} : null;
    }).filter(Boolean);
    out.PRA = {...raw, mean, steps, baseline: STATS.reduce((t, s) => t + out[s].baseline, 0)};
  }
  return out;
}

// Chance that the result lands on the given side of the line, from a negative binomial with the
// projected mean and a variance of dispersion × mean. Returns {chance, push} as fractions.
export function lineChance(model, line, side) {
  if (!model || !(model.mean > 0) || !Number.isFinite(line) || line < 0) return null;
  const mu = model.mean, variance = Math.max(mu * 1.0001, mu * model.dispersion);
  const p = mu / variance, r = mu * mu / (variance - mu);
  const cap = Math.ceil(line) + 1;
  let prob = Math.exp(r * Math.log(p)), below = 0, at = 0;
  for (let k = 0; k <= cap; k++) {
    if (k > 0) prob *= (k - 1 + r) / k * (1 - p);
    if (k < line) below += prob;
    else if (k === line) at += prob;
  }
  const over = Math.max(0, 1 - below - at);
  if (side === 'At least') return {chance: over + at, push: 0};
  if (side === 'Under') return {chance: below, push: at};
  return {chance: over, push: at};
}
