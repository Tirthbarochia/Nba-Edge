// Public, read-only NBA Kalshi market data. No Kalshi key is required.
// Never construct URLs from arbitrary user-provided hosts or paths.
const BASE = 'https://external-api.kalshi.com/trade-api/v2';
const SERIES = new Set(['KXNBAPTS', 'KXNBAREB', 'KXNBAAST']);
const cache = new Map();
const iso = s => /^20\d{2}-\d{2}-\d{2}$/.test(s || '');
const safeDecimal = v => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
function etToday() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function dateInEvent(event, d){
  const [year,month,day] = d.split('-');
  const mons=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const key=`${year.slice(2)}${mons[Number(month)-1]}${day}`;
  return (event||'').toUpperCase().includes(key);
}
export default async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','public, s-maxage=30, stale-while-revalidate=30');
  const series=String(req.query.series||'KXNBAPTS').toUpperCase();
  const date=String(req.query.date||etToday());
  if (!SERIES.has(series)||!iso(date)) return res.status(400).json({error:'Invalid NBA series or date'});
  const cacheKey=`${series}:${date}`;
  const hit=cache.get(cacheKey);
  if (hit && hit.exp>Date.now()) return res.status(200).json({...hit.value,cached:true});
  try {
    const u=new URL(`${BASE}/markets`);
    u.searchParams.set('series_ticker',series);
    u.searchParams.set('status','open');
    u.searchParams.set('limit','1000');
    const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(11000)});
    if(!r.ok) return res.status(r.status===429?429:502).json({error:r.status===429?'Kalshi rate limit reached. Retry shortly.':`Kalshi markets unavailable (HTTP ${r.status}).`});
    const response=await r.json();
    const all=Array.isArray(response.markets)?response.markets:[];
    const filtered=all.filter(m=>dateInEvent(m.event_ticker,date)).slice(0,200);
    const value={source:'Kalshi official public API',series,date,refreshed:new Date().toISOString(),cached:false,
      note:response.cursor?'Showing up to first 1,000 open markets for this series; more pages may exist.':'Market quotes are snapshots, may change, and exclude fees.',
      data:filtered.map(m=>({ticker:String(m.ticker||''),event:String(m.event_ticker||''),title:String(m.title||m.yes_sub_title||''),yesBid:safeDecimal(m.yes_bid_dollars),yesAsk:safeDecimal(m.yes_ask_dollars),noAsk:safeDecimal(m.no_ask_dollars),volume:safeDecimal(m.volume_fp),close:m.close_time||null})).filter(m=>m.ticker)};
    cache.set(cacheKey,{value,exp:Date.now()+30000});
    if(cache.size>40) for(const [k,v] of cache) if(v.exp<Date.now()) cache.delete(k);
    return res.status(200).json(value);
  } catch {return res.status(502).json({error:'Could not contact Kalshi right now.'});}
}