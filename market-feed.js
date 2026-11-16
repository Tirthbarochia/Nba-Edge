// The only code that spends The Odds API credits for the public pages.
// It is called by snapshot.js on a budgeted schedule, never directly by a visitor request.
const base = 'https://api.the-odds-api.com/v4/sports/basketball_nba/events';
const markets = 'player_points,player_rebounds,player_assists';
const eastern = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
// One region, so the provider bills at most one credit per market it returns.
export const MAX_EVENT_COST = markets.split(',').length;

const count = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
async function call(path, params) {
  params.set('apiKey', process.env.ODDS_API_KEY);
  const response = await fetch(base + path + '?' + params, {signal:AbortSignal.timeout(10000)});
  if (!response.ok) {
    // Log why the provider refused (status and its own error code; never the key or URL).
    const detail = await response.json().catch(() => ({}));
    const code = String(detail?.error_code || '').slice(0,60), message = String(detail?.message || '').slice(0,160);
    console.warn('odds-provider', response.status, code, message);
    const error = Error('Provider unavailable');
    error.quota = /usage|quota|credit/i.test(code + ' ' + message);
    throw error;
  }
  const header = name => count(response.headers?.get?.(name));
  return {data: await response.json(), usage: {last: header('x-requests-last'), used: header('x-requests-used'), remaining: header('x-requests-remaining')}};
}

// The schedule list does not count against the provider's usage quota.
export async function upcoming(date, now = Date.now()) {
  const {data} = await call('', new URLSearchParams());
  return data.filter(g => eastern.format(new Date(g.commence_time)) === date && Date.parse(g.commence_time) > now);
}
export async function quotes(event) {
  const {data, usage} = await call('/' + event + '/odds', new URLSearchParams({regions:'us',markets,oddsFormat:'american'}));
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
  return {rows, usage};
}
