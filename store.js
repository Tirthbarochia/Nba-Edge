// Server-only access to the saved sportsbook snapshot and insight history in Supabase.
// The tables accept no public reads or writes: every request must carry the private
// NBA_EDGE_SERVER_TOKEN header, which the database checks against a stored SHA-256 hash.
// Never import this file from a browser module.
const base = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');

export function configured() {
  return Boolean(base() && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.NBA_EDGE_SERVER_TOKEN);
}

// query: PostgREST filters, e.g. {slate_date:'eq.2026-11-15', order:'tip.asc'}.
export async function db(method, table, {query = {}, body, prefer} = {}) {
  if (!configured()) throw Error('Store not configured');
  const headers = {
    apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
    'x-nba-edge-server': process.env.NBA_EDGE_SERVER_TOKEN,
    accept: 'application/json'
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const response = await fetch(base() + '/rest/v1/' + table + '?' + new URLSearchParams(query), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('Store unavailable');
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

export const eastern = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'});
