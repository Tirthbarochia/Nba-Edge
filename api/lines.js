import {upcoming,quotes} from '../market-feed.js';
const eastern = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.ODDS_API_KEY) return res.status(503).json({error:'Live lines are unavailable.'});
  try {
    const date = eastern.format(new Date());
    const games = await upcoming(date);
    const event = req.query.event;
    let payload = {date, games:games.map(g => ({id:g.id,home:g.home_team,away:g.away_team,tip:g.commence_time}))};
    if (event !== undefined) {
      if (!games.some(g => g.id === event)) return res.status(404).json({error:'This matchup is no longer on the upcoming slate.'});
      const rows = await quotes(event);
      payload = {date,rows};
    }
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.json(payload);
  } catch { return res.status(503).json({error:'Live sportsbook lines are temporarily unavailable. Try again shortly.'}); }
}
