// TEMPORARY: preview-only helper to inspect ESPN response shapes. Never merged to main.
export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production') return res.status(404).end();
  const url = new URL(String(req.query.u || ''));
  if (!/(^|\.)espn\.com$/.test(url.hostname)) return res.status(400).end();
  const r = await fetch(url, {signal: AbortSignal.timeout(9000)});
  const text = await r.text();
  const path = String(req.query.p || '').split('.').filter(Boolean);
  let data; try { data = JSON.parse(text); } catch { return res.status(200).json({status:r.status, text:text.slice(0,2000)}); }
  for (const key of path) data = data?.[key];
  const shape = (v, d=0) => d > Number(req.query.d || 2) ? typeof v : Array.isArray(v) ? [v.length, shape(v[0], d+1)] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, shape(x, d+1)])) : v;
  res.json({status:r.status, shape: req.query.raw ? JSON.stringify(data).slice(0, Number(req.query.n || 6000)) : shape(data)});
}
