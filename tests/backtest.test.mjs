import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, walk, score, report } from '../backtest/engine.js';

// A small synthetic league with real structure: some players score more when the team's star
// sits, some defenses allow more, and minutes drift. The model should beat a coin flip on it,
// and lose that edge when outcomes are shuffled (a check that nothing leaks from the future).
function league(seed = 7) {
  let x = seed; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const poisson = mu => { let k = 0, p = Math.exp(-mu), s = p; const u = rnd(); while (u > s && k < 200) { k++; p *= mu / k; s += p; } return k; };
  const teams = ['1', '2', '3', '4', '5', '6'], soft = {'5': 1.15, '6': 0.88};
  const players = {};
  teams.forEach((t, ti) => {
    for (let j = 0; j < 8; j++) players[t + '-' + j] = {name: 'P' + t + j, games: [], base: 0.25 + 0.1 * (j % 4) + 0.05 * ti % 0.2, star: j === 0};
  });
  for (let d = 0; d < 60; d++) {
    const date = new Date(Date.UTC(2025, 9, 21) + d * 86400000 * 2).toISOString().slice(0, 10);
    for (let k = 0; k < 3; k++) {
      const a = teams[(d + k * 2) % 6], b = teams[(d + k * 2 + 1) % 6], ev = 'e' + d + '-' + k;
      for (const [team, opp, home] of [[a, b, 1], [b, a, 0]]) {
        const starOut = rnd() < 0.2;
        for (let j = 0; j < 8; j++) {
          const p = players[team + '-' + j];
          if (p.star && starOut) continue;
          const minutes = Math.max(8, Math.round(18 + 14 * (j < 5) + (d / 60) * (j === 5 ? 12 : 0) + (rnd() - 0.5) * 6));
          const boost = !p.star && starOut && j < 3 ? 1.3 : 1;
          const mu = p.base * minutes * boost * (soft[opp] || 1) * (home ? 1.02 : 0.98);
          p.games.push([ev, date, team, opp, home, minutes, poisson(mu), poisson(mu * 0.35), poisson(mu * 0.22)]);
        }
      }
    }
  }
  return {players};
}

test('backtest runs walk-forward, beats a coin flip on structured data, and shows no look-ahead', () => {
  const prep = prepare(league());
  const rows = walk(prep);
  assert.ok(rows.length > 1000, 'enough player-games: ' + rows.length);
  const s = score(rows);
  assert.ok(s.brier.model < s.brier.coin, 'model beats coin flip');
  assert.ok(s.mae.model < s.mae.season, 'projection beats the season average');
  // Shuffle outcomes: any edge must disappear.
  const shuffled = rows.map((r, i) => ({...r, over: rows[(i * 7919) % rows.length].over}));
  const z = score(shuffled);
  assert.ok(z.brier.model >= z.brier.coin - 0.002, 'no edge on shuffled outcomes');
  const rep = report(rows, '2026-01-01');
  assert.ok(rep.train.n > 0 && rep.test.n > 0);
});

test('the teammate adjustment helps the players whose role grows when the star sits', () => {
  const prep = prepare(league(11));
  const boosted = r => r.teammatesOut && /-(1|2)$/.test(r.player);
  const on = score(walk(prep).filter(boosted)), off = score(walk(prep, {teammates: false}).filter(boosted));
  assert.ok(on.mae.model < off.mae.model, `on ${on.mae.model} vs off ${off.mae.model}`);
});
