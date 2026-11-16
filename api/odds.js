// NBA Edge: a server-only, authenticated proxy for The Odds API.
// Never expose ODDS_API_KEY in a client asset or source-controlled .env file.
import { configured, eastern } from '../store.js';
import { scannerDay, scannerSpent } from '../snapshot.js';
const SPORT = 'basketball_nba';
const MARKETS = new Set(['player_points','player_rebounds','player_assists','player_threes','player_points_rebounds_assists','player_points_alternate','player_rebounds_alternate','player_assists_alternate','player_threes_alternate']);
const cached = new Map();
const now = () => Date.now();

async function authorized(request) {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const jwt = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !publicKey || !jwt) return false;
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: publicKey, authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(7000)
    });
    return r.ok && !!(await r.json()).id;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await authorized(req)) return res.status(401).json({ error: 'Please sign in to use the live market scanner.' });
  const key = process.env.ODDS_API_KEY;
  if (!key) return res.status(503).json({ error: 'The Odds API key has not been configured on the server.' });
  const mode = req.query.mode === 'props' ? 'props' : 'events';
  const eventId = String(req.query.eventId || '');
  const requestedMarket = String(req.query.market || 'player_points');
  if (mode === 'props' && !/^[a-zA-Z0-9]{10,80}$/.test(eventId)) return res.status(400).json({ error: 'Select a valid event.' });
  if (mode === 'props' && !MARKETS.has(requestedMarket)) return res.status(400).json({ error: 'Unsupported prop market.' });
  const cacheKey = `${mode}|${eventId}|${requestedMarket}`;
  const existing = cached.get(cacheKey);
  if (existing && existing.expires > now()) return res.status(200).json({...existing.payload, cache: true});
  // Each props request costs provider credits, so it draws on a small daily allowance.
  let day = null;
  if (mode === 'props') {
    if (!configured()) return res.status(503).json({error:'The sportsbook scanner is temporarily unavailable.'});
    try { day = await scannerDay(eastern.format(new Date())); }
    catch { return res.status(503).json({error:'The sportsbook scanner is temporarily unavailable.'}); }
    if (!day) return res.status(429).json({error:'Today\u2019s sportsbook scanner allowance has been used. It resets at midnight ET.'});
  }
  const path = mode === 'events'
    ? `/v4/sports/${SPORT}/events`
    : `/v4/sports/${SPORT}/events/${eventId}/odds`;
  const params = new URLSearchParams({ apiKey: key });
  if (mode === 'props') { params.set('regions','us'); params.set('markets',requestedMarket); params.set('oddsFormat','american'); }
  try {
    const upstream = await fetch(`https://api.the-odds-api.com${path}?${params.toString()}`, {signal: AbortSignal.timeout(12000)});
    const rawText = await upstream.text();
    if (!upstream.ok) {
      // Never relay arbitrary upstream diagnostics which might contain sensitive URL query params.
      const error = upstream.status === 401 ? 'API credential rejected.' :
        upstream.status === 429 ? 'API quota or rate limit reached.' :
        upstream.status === 422 ? 'This market is unavailable for the selected event or plan.' :
        `Odds provider returned HTTP ${upstream.status}.`;
      return res.status(upstream.status === 429 ? 429 : 502).json({error});
    }
    if (day) {
      const count = name => { const v = upstream.headers?.get?.(name); return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; };
      await scannerSpent(day, {last:count('x-requests-last'), used:count('x-requests-used'), remaining:count('x-requests-remaining')}).catch(() => {});
    }
    const data = JSON.parse(rawText);
    let result;
    if (mode === 'events') {
      result = Array.isArray(data) ? data.map(g => ({id:g.id,home:g.home_team,away:g.away_team,commence:g.commence_time})).filter(g=>g.id).slice(0,40) : [];
    } else {
      result = [];
      for (const b of data.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
        if (!o.description || !Number.isFinite(Number(o.point)) || !['Over','Under'].includes(o.name)) continue;
        result.push({player:o.description,side:o.name,point:Number(o.point),odds:o.price,book:b.title,market:m.key,updated:m.last_update,event:data.id});
      }
      result = result.slice(0,550);
    }
    const payload = {source:'The Odds API (sportsbooks, not official Pick6)',mode,data:result,refreshed:new Date().toISOString(),cache:false};
    // Process-local cache only; durable production caching is advisable at scale.
    cached.set(cacheKey,{payload,expires:now()+(mode==='events'?180000:90000)});
    if (cached.size>100) for (const [k,v] of cached) if (v.expires<now()) cached.delete(k);
    return res.status(200).json(payload);
  } catch {
    return res.status(502).json({error:'Odds provider unavailable. Try again later.'});
  }
}