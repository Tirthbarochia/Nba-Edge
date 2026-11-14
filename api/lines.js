// A shared public snapshot. Only today's scheduled NBA events can trigger a quote request.
const base = 'https://api.the-odds-api.com/v4/sports/basketball_nba/events';
const markets = 'player_points,player_rebounds,player_assists';
const eastern = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const cache = new Map();

async function snapshot(id, path, params) {
  const saved = cache.get(id);
  if (saved && saved.until > Date.now()) return saved.result;
  for (const [key, entry] of cache) if (entry.until <= Date.now()) cache.delete(key);
  params.set('apiKey', process.env.ODDS_API_KEY);
  const result = fetch(base + path + '?' + params, {signal:AbortSignal.timeout(10000)})
    .then(async response => {
      if (!response.ok) throw Error('Provider unavailable');
      return response.json();
    });
  const entry = {until:Date.now() + 300000, result};
  cache.set(id, entry);
  try { return await result; }
  catch (error) { if (cache.get(id) === entry) cache.delete(id); throw error; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.ODDS_API_KEY) return res.status(503).json({error:'Live lines are unavailable.'});
  try {
    const date = eastern.format(new Date());
    const schedule = await snapshot(date, '', new URLSearchParams());
    const games = schedule.filter(g => eastern.format(new Date(g.commence_time)) === date && Date.parse(g.commence_time) > Date.now());
    const event = req.query.event;
    let payload = {date, games:games.map(g => ({id:g.id,home:g.home_team,away:g.away_team,tip:g.commence_time}))};
    if (event !== undefined) {
      if (!games.some(g => g.id === event)) return res.status(404).json({error:'This matchup is no longer on the upcoming slate.'});
      const data = await snapshot(event, '/' + event + '/odds', new URLSearchParams({regions:'us',markets,oddsFormat:'american'}));
      const rows = [];
      for (const book of data.bookmakers || []) for (const market of book.markets || []) {
        const quotes = new Map();
        for (const o of market.outcomes || []) {
          if (!o.description || !Number.isFinite(o.point) || !Number.isFinite(o.price) || !['Over','Under'].includes(o.name)) continue;
          const key = JSON.stringify([o.description,o.point]);
          const row = quotes.get(key) || {player:o.description,line:o.point,metric:market.key.slice(7),book:book.title,updated:market.last_update || book.last_update};
          row[o.name] = o.price;
          quotes.set(key,row);
        }
        rows.push(...quotes.values());
      }
      payload = {date,rows};
    }
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.json(payload);
  } catch { return res.status(503).json({error:'Live sportsbook lines are temporarily unavailable. Try again shortly.'}); }
}
