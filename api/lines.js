// Today's sportsbook board, served from the copy saved in Supabase. A visitor request never
// calls the odds provider directly; snapshot.js decides when a budgeted refresh is due.
import { configured, eastern } from '../store.js';
import { ensure, slate, eventRows } from '../snapshot.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!configured()) return res.status(503).json({error:'Live lines are unavailable.'});
  try {
    const date = eastern.format(new Date());
    const {day, status, startHour} = await ensure(date);
    const games = await slate(date);
    const event = req.query.event;
    let payload = {date, status, startHour, updated:day?.fetched_at || null, games:games.map(g => ({id:g.event_id,home:g.home,away:g.away,tip:g.tip}))};
    if (event !== undefined) {
      if (!games.some(g => g.event_id === event)) return res.status(404).json({error:'This matchup is no longer on the upcoming slate.'});
      const saved = await eventRows(date, event);
      payload = {date, updated:saved?.fetched_at || null, rows:saved?.rows || []};
    }
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.json(payload);
  } catch { return res.status(503).json({error:'Live sportsbook lines are temporarily unavailable. Try again shortly.'}); }
}
