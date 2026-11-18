// TEMPORARY, preview deployments only: downloads a past season of ESPN game logs and runs the
// walk-forward backtest in backtest/engine.js. Never deployed to production.
import { prepare, walk, report, score } from '../backtest/engine.js';
import { DEFAULTS } from '../projection.js';
const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const common = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const cache = new Map();
const eastern = d => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(d));
async function json(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, {signal: AbortSignal.timeout(15000)}); if (r.ok) return r.json(); if (r.status === 404) return null; } catch {}
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  return null;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({length: n}, async () => { while (i < items.length) await fn(items[i++]); })); }
async function load(season) {
  if (cache.has(season)) return cache.get(season);
  // Every player with regular-season stats that season (team rosters are not kept for past seasons).
  const list = await json(common + '/statistics/byathlete?season=' + season + '&seasontype=2&limit=1000');
  const ids = new Map((list?.athletes || []).map(a => [String(a.athlete?.id), a.athlete?.displayName])); let missing = 0;
  const players = {};
  await pool([...ids.keys()], 16, async id => {
    const log = await json(common + '/athletes/' + id + '/gamelog?season=' + season);
    if (!log?.names) { missing++; return; }
    const col = n => log.names.indexOf(n), c = [col('minutes'), col('points'), col('totalRebounds'), col('assists')];
    const games = new Map();
    for (const group of log.seasonTypes || []) {
      if (!/regular season/i.test(group.displayName)) continue;
      for (const cat of group.categories || []) for (const row of cat.events || []) {
        const g = log.events?.[row.eventId];
        if (!g?.gameDate || !['W', 'L'].includes(g.gameResult)) continue;
        const v = c.map(i => parseFloat(String(row.stats?.[i] ?? '')));
        if (v.every(Number.isFinite)) games.set(row.eventId, [row.eventId, eastern(g.gameDate), g.team?.id, g.opponent?.id, g.atVs === 'vs' ? 1 : 0, ...v]);
      }
    }
    if (games.size) players[id] = {name: ids.get(id), games: [...games.values()]};
  });
  const data = {season, players, roster: ids.size, missing, fetched: new Date().toISOString()};
  if (Object.keys(players).length < 100) return {data, prep: prepare(data)};
  cache.set(season, {data, prep: prepare(data)});
  return cache.get(season);
}
const trim = r => r && ({...r, calibration: r.calibration});
export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production') return res.status(404).end();
  if (req.query.mode === 'peek') {
    const url = new URL(String(req.query.u));
    if (!/(^|\.)espn\.com$/.test(url.hostname)) return res.status(400).end();
    const d = await json(url);
    let v = d; for (const k of String(req.query.p || '').split('.').filter(Boolean)) v = v?.[k];
    return res.json({text: JSON.stringify(v)?.slice(0, Number(req.query.n || 3000))});
  }
  const t0 = Date.now();
  const season = String(req.query.season || '2026');
  const {data, prep} = await load(season);
  const settings = req.query.settings ? JSON.parse(req.query.settings) : {};
  const options = {minMinutes: Number(req.query.minMinutes || 20)};
  const cutoff = req.query.cutoff || null;
  const mode = req.query.mode || 'evaluate';
  const meta = {season, roster: data.roster, players: Object.keys(data.players).length, missing: data.missing,
    playerGames: Object.values(data.players).reduce((s, p) => s + p.games.length, 0), loadSeconds: (Date.now() - t0) / 1000};
  if (mode === 'meta') return res.json(meta);
  if (mode === 'evaluate') return res.json({meta, settings: {...DEFAULTS, ...settings}, report: report(walk(prep, settings, options), cutoff), seconds: (Date.now() - t0) / 1000});
  if (mode === 'grid') {
    // Scores many settings on the training window only (dates before cutoff) and on the test window.
    const grid = JSON.parse(req.query.grid);
    const out = [];
    for (const g of grid) {
      const rows = walk(prep, {...settings, ...g}, options);
      const tr = score(rows.filter(r => !cutoff || r.date < cutoff)), te = score(rows.filter(r => cutoff && r.date >= cutoff));
      const pick = x => ({n: x.n, brier: x.brier?.model, logLoss: x.logLoss?.model, ll: x.likelihood?.model, mae: x.mae?.model, cal: x.calibration?.map(b => [b.bin, b.n, +b.predicted.toFixed(3), +b.actual.toFixed(3)])});
      out.push({settings: g, train: pick(tr), test: pick(te)});
      if (Date.now() - t0 > 250000) break;
    }
    return res.json({meta, out, seconds: (Date.now() - t0) / 1000});
  }
  res.status(400).json({error: 'mode'});
}
