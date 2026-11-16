// SportsGameOdds: the primary sportsbook source when SPORTSGAMEODDS_API_KEY is set.
// One request returns every upcoming NBA game with all of its odds, and the provider bills
// one "object" per game returned, however many markets or sportsbooks are included.
// Called only by snapshot.js on a budgeted schedule, never directly by a visitor request.
const url = 'https://api.sportsgameodds.com/v2/events';
const eastern = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const hour = (now, timeZone) => Number(new Intl.DateTimeFormat('en-US', {timeZone, hour:'numeric', hourCycle:'h23'}).format(new Date(now)));
const stats = {points:'points', rebounds:'rebounds', assists:'assists'};
const books = {fanduel:'FanDuel', draftkings:'DraftKings', betmgm:'BetMGM', caesars:'Caesars', espnbet:'ESPN BET', bovada:'Bovada',
  unibet:'Unibet', pointsbet:'PointsBet', williamhill:'William Hill', bet365:'Bet365', pinnacle:'Pinnacle', betrivers:'BetRivers', fanatics:'Fanatics'};
const nameFromId = id => id.replace(/_\d+_[A-Z]+$/, '').split('_').filter(Boolean).map(w => w[0] + w.slice(1).toLowerCase()).join(' ');

// Turns one event's odds into the same row shape the site already stores:
// {player, line, metric, book, updated, Over, Under}. `updated` is when this copy was taken.
export function rowsFromEvent(event, fetched) {
  const rows = new Map();
  for (const odd of Object.values(event.odds || {})) {
    const metric = stats[odd.statID], side = {over:'Over', under:'Under'}[odd.sideID], id = odd.statEntityID;
    if (!metric || !side || odd.betTypeID !== 'ou' || odd.periodID !== 'game' || !id || ['all','home','away'].includes(id)) continue;
    const info = event.players?.[id] || {};
    const player = info.name || [info.firstName, info.lastName].filter(Boolean).join(' ') || nameFromId(id);
    for (const [book, quote] of Object.entries(odd.byBookmaker || {})) {
      const line = Number(quote?.overUnder), price = Number(quote?.odds);
      if (!quote || quote.available === false || quote.overUnder == null || !Number.isFinite(line) || !Number.isFinite(price) || !price) continue;
      const key = JSON.stringify([id, metric, book, line]);
      const row = rows.get(key) || {player, line, metric, book: books[book] || book, updated: fetched};
      row[side] = price;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

async function page(params) {
  const response = await fetch(url + '?' + params, {headers:{'x-api-key': process.env.SPORTSGAMEODDS_API_KEY}, signal:AbortSignal.timeout(30000)});
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    // Log the provider's own reason (never the key).
    console.warn('sgo-provider', response.status, String(body?.error || body?.message || '').slice(0,160));
    const error = Error('Provider unavailable');
    error.quota = response.status === 429;
    throw error;
  }
  return body;
}

// Returns today's upcoming games with their player lines and the number of objects billed.
export async function sgoSlate(date, now = Date.now()) {
  // End of the Eastern day as a UTC instant, so tomorrow's games are not fetched (and billed).
  const offset = (hour(now, 'UTC') - hour(now, 'America/New_York') + 24) % 24;
  const end = Date.parse(date + 'T00:00:00Z') + (24 + offset) * 3600000;
  const events = [];
  let cursor = null;
  for (let pages = 0; pages < 4; pages++) {
    const params = new URLSearchParams({leagueID:'NBA', oddsAvailable:'true', startsAfter:new Date(now).toISOString(), startsBefore:new Date(end).toISOString(), limit:'25'});
    if (cursor) params.set('cursor', cursor);
    const body = await page(params);
    events.push(...(body.data || []));
    cursor = body.nextCursor;
    if (!cursor || !(body.data || []).length) break;
  }
  const fetched = new Date().toISOString();
  const games = events
    .filter(e => e.eventID && e.status?.startsAt && e.teams?.home?.names?.long && e.teams?.away?.names?.long)
    .filter(e => eastern.format(new Date(e.status.startsAt)) === date && Date.parse(e.status.startsAt) > now)
    .map(e => { const rows = rowsFromEvent(e, fetched); return {home:e.teams.home.names.long, away:e.teams.away.names.long, tip:new Date(e.status.startsAt).toISOString(), ok:rows.length > 0, rows}; });
  // The provider counts each response as at least one object.
  return {games, objects: Math.max(1, events.length)};
}
