const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const logs = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
const validId = value => typeof value === 'string' && /^\d{1,10}$/.test(value);
const easternDay = date => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));

async function read(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(9000)});
  if (!response.ok) throw new Error('Source unavailable');
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const {date, team, season, player} = req.query;
  let data;
  try {
    if (player && validId(player) && /^20\d{2}$/.test(season)) {
      const log = await read(logs + '/' + player + '/gamelog?season=' + season);
      const cols = ['points','totalRebounds','assists'].map(key => log.names?.indexOf(key) ?? -1);
      const games = new Map();
      for (const group of log.seasonTypes || []) {
        if (!/regular season/i.test(group.displayName)) continue;
        for (const category of group.categories || []) {
          for (const row of category.events || []) {
            const event = log.events?.[row.eventId];
            const values = cols.map(i => row.stats?.[i]);
            if (!event?.gameDate || !['W','L'].includes(event.gameResult) || !values.every(v => /^\d+$/.test(String(v)))) continue;
            games.set(row.eventId,{date:easternDay(event.gameDate), opponent:event.opponent.abbreviation, opponentId:event.opponent.id, venue:event.atVs, values:values.map(Number)});
          }
        }
      }
      data = [...games.values()].sort((a,b)=>b.date.localeCompare(a.date));
    } else if (validId(team) && /^20\d{2}$/.test(season)) {
      const roster = await read(site + '/teams/' + team + '/roster?season=' + season);
      data = (roster.athletes || []).map(a=>({id:a.id,name:a.displayName})).sort((a,b)=>a.name.localeCompare(b.name));
    } else if (typeof date === 'string' && /^20\d\d-\d\d-\d\d$/.test(date)) {
      const board = await read(site + '/scoreboard?dates=' + date.replaceAll('-',''));
      data = board.events.filter(e=>easternDay(e.date)===date).map(e=>({
        id:e.id,name:e.name,season:e.season.year,status:e.status.type.shortDetail,
        teams:e.competitions[0].competitors.map(c=>({id:c.team.id,name:c.team.displayName,abbr:c.team.abbreviation}))
      }));
    } else return res.status(400).json({error:'Choose a valid date, team or player.'});
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
    return res.json({data,updated:new Date().toISOString()});
  } catch {
    return res.status(502).json({error:'ESPN game data is temporarily unavailable. Please refresh.'});
  }
}
