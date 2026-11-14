/**
 * Public, read-only Kalshi NBA live-data lookup.
 * Trade endpoints are intentionally not implemented.
 * GET /api/live?eventTicker=KX...&stats=1
 * GET /api/live?milestoneId=<UUID>&stats=1
 */
const BASE = 'https://external-api.kalshi.com/trade-api/v2';
const allowedTicker = /^[A-Z0-9_-]{8,110}$/;
const allowedMilestone = /^[a-zA-Z0-9_-]{8,100}$/;
const cached = new Map();

async function getJSON(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(9500)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`upstream_${response.status}`);
  return await response.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=20');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const eventTicker = String(req.query.eventTicker || '').toUpperCase().trim();
  let milestoneId = String(req.query.milestoneId || '').trim();
  const includeStats = req.query.stats !== '0';
  if ((!eventTicker && !milestoneId) || (eventTicker && !allowedTicker.test(eventTicker)) ||
      (milestoneId && !allowedMilestone.test(milestoneId))) {
    return res.status(400).json({ error: 'Provide a valid Kalshi event ticker or milestone ID.' });
  }
  const cacheKey = `${eventTicker}/${milestoneId}/${includeStats}`;
  const hit = cached.get(cacheKey);
  if (hit && hit.expires > Date.now()) return res.status(200).json({ ...hit.data, cached: true });
  try {
    let milestone = null;
    if (!milestoneId) {
      const milestones = await getJSON(`/milestones?related_event_ticker=${encodeURIComponent(eventTicker)}&limit=10`);
      const list = milestones?.milestones || [];
      milestone = list.find(m => (m.related_event_tickers || []).includes(eventTicker) || (m.primary_event_tickers || []).includes(eventTicker)) || null;
      if (!milestone?.id) return res.status(404).json({ error: 'No live-data milestone is linked to this event ticker.' });
      milestoneId = milestone.id;
    }
    const data = await getJSON(`/live_data/milestone/${encodeURIComponent(milestoneId)}?include_player_stats=${includeStats}`);
    if (!data?.live_data) return res.status(404).json({ error: 'Live game data is not yet available for this milestone.' });
    // Sport-specific "details" is deliberately preserved without guessing fields.
    const payload = {
      source: 'Kalshi public live data (read-only)',
      milestoneId,
      eventTicker: eventTicker || null,
      milestone: milestone ? { id: milestone.id, type: milestone.type || null, start: milestone.start_date || null, end: milestone.end_date || null } : null,
      liveData: data.live_data,
      fetchedAt: new Date().toISOString(),
      cached: false,
      note: 'Live stats may lag or be unavailable; player stats are only provided when Kalshi has player mappings.'
    };
    cached.set(cacheKey, { expires: Date.now() + 20000, data: payload });
    if (cached.size > 100) {
      for (const [key, value] of cached) if (value.expires < Date.now()) cached.delete(key);
    }
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(err.message === 'upstream_429' ? 429 : 502).json({ error: err.message === 'upstream_429' ? 'Kalshi rate limit reached.' : 'Kalshi live data is temporarily unavailable.' });
  }
}