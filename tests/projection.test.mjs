import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStat, projectAll, lineChance } from '../projection.js';

const near = (a, b, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const games = (n, f) => Array.from({length:n}, (_, i) => f(i));

test('with almost no extra spread the chance matches a Poisson distribution', () => {
  const r = lineChance({mean:20, dispersion:1.0000001}, 20.5, 'Over');
  near(r.chance, 0.4409, 0.001);   // Poisson(20): P(X >= 21)
  assert.equal(r.push, 0);
});

test('Over, Under and push add up to one, and At least includes the line', () => {
  const m = {mean:7.2, dispersion:1.6};
  const over = lineChance(m, 7, 'Over'), under = lineChance(m, 7, 'Under'), least = lineChance(m, 7, 'At least');
  near(over.chance + under.chance + over.push, 1, 1e-9);
  near(least.chance, over.chance + over.push, 1e-9);
  assert.ok(over.push > 0.05);
});

test('more game-to-game variation spreads the chances toward the tails', () => {
  const tight = lineChance({mean:20, dispersion:1.05}, 26.5, 'Over').chance;
  const loose = lineChance({mean:20, dispersion:3}, 26.5, 'Over').chance;
  assert.ok(loose > tight);
});

test('fewer than five games gives no projection', () => {
  assert.equal(projectStat(games(4, () => ({minutes:30, value:20, home:true}))), null);
});

test('recent minutes drive the projection when a role changes', () => {
  // Ten games at 20 minutes, then the last three at 34 minutes; same per-minute rate.
  const g = games(13, i => ({minutes: i < 3 ? 34 : 20, value: i < 3 ? 17 : 10, home: i % 2 === 0}));
  const m = projectStat(g);
  assert.ok(m.minutes > 27 && m.minutes < 34, 'recent minutes weigh most');
  near(m.rate, 0.5, 1e-9);
  assert.ok(m.mean > 13, 'projection rises with the new role');
});

test('teammates out: blends toward games without them, and says so when there are too few', () => {
  const g = games(12, i => ({minutes: 30, value: i < 4 ? 24 : 15, home: true, without: i < 4}));
  const m = projectStat(g, {teammatesOut:['Star Guard']});
  const step = m.steps.find(s => s.key === 'teammates');
  assert.ok(step.change > 2, 'usage bump measured');
  assert.match(step.detail, /4 games without/);
  const few = projectStat(games(12, i => ({minutes:30, value:15, home:true, without:i < 2})), {teammatesOut:['Star Guard']});
  assert.equal(few.steps.find(s => s.key === 'teammates').change, 0);
});

test('home or away is a small, capped effect', () => {
  const g = games(20, i => ({minutes:30, value: i % 2 ? 30 : 10, home: i % 2 === 1}));
  const home = projectStat(g, {home:true}), road = projectStat(g, {home:false});
  const share = s => s.steps.find(x => x.key === 'venue').change / s.baseline;
  assert.ok(share(home) <= 0.0801 && share(home) > 0);
  assert.ok(share(road) >= -0.0801 && share(road) < 0);
});

test('opponent defense is shrunk by games played and capped at 12 percent', () => {
  const g = games(10, () => ({minutes:30, value:20, home:true}));
  const soft = projectStat(g, {opponent:{team:'AAA', allowed:130, league:115, games:15}});
  const early = projectStat(g, {opponent:{team:'AAA', allowed:130, league:115, games:2}});
  const capped = projectStat(g, {opponent:{team:'AAA', allowed:200, league:100, games:80}});
  const effect = s => s.steps.find(x => x.key === 'opponent').change / 20;
  near(effect(soft), (130/115 - 1) * 15/25, 1e-9);
  assert.ok(effect(early) < effect(soft));
  near(effect(capped), 0.12, 1e-9);
});

test('PRA adds the three stat projections and keeps a breakdown', () => {
  const g = games(10, i => ({minutes:32, home:true, values:{points:20 + (i % 3), rebounds:6, assists:4}}));
  const all = projectAll(g, {home:true, opponents:{points:{team:'X', allowed:110, league:115, games:12}}});
  near(all.PRA.mean, all.points.mean + all.rebounds.mean + all.assists.mean, 1e-9);
  assert.ok(all.PRA.steps.some(s => s.key === 'opponent'));
});
