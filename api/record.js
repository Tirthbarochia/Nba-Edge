// Graded track records for each model: the site's automatic insights and Claude's picks.
// Grading reads free ESPN box scores only; no sportsbook credits are used.
import { configured } from '../store.js';
import { grade, record } from '../record.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).end();
  if(!configured())return res.status(503).json({error:'The track record is temporarily unavailable.'});
  try {
    await grade().catch(error=>console.warn('grading',String(error?.message||error).slice(0,160)));
    const [site,claude]=await Promise.all([record('site'),record('claude')]);
    res.setHeader('Cache-Control','public,max-age=0,s-maxage=120');
    return res.json({site,claude});
  } catch {return res.status(503).json({error:'The track record is temporarily unavailable.'});}
}
