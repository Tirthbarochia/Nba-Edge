// Today's Insights, read from the saved history in Supabase. Suggestions are never removed
// during the day: a later update can add new ones or re-check earlier ones, and each pick
// reports when it was first suggested and whether the latest update still supported it.
// The response also carries the graded track record of every insight published so far.
import { configured, eastern } from '../store.js';
import { ensure, savedPicks } from '../snapshot.js';
import { grade, record } from '../record.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).end();
  if(!configured())return res.status(503).json({error:'Daily insights are temporarily unavailable.'});
  const date=eastern.format(new Date());
  try {
    const {day,status,startHour}=await ensure(date);
    // Grading only reads free box scores; a failure must not hide today's insights.
    await grade().catch(error=>console.warn('grading',String(error?.message||error).slice(0,160)));
    const picks=(await savedPicks(date)).map(r=>({...r.pick,key:r.pick_key,active:r.active,suggested:r.first_suggested_at,confirmed:r.last_confirmed_at,result:r.result||null,actual:r.actual==null?null:Number(r.actual)}));
    picks.sort((a,b)=>b.active-a.active || b.consensus-a.consensus);
    const track=await record('site').catch(()=>null);
    // Claude's researched picks: published by a daily research session, graded separately.
    const claude=await Promise.all([savedPicks(date,'claude'),record('claude')]).then(([rows,rec])=>({picks:rows.map(r=>({...r.pick,key:r.pick_key,suggested:r.first_suggested_at,result:r.result||null,actual:r.actual==null?null:Number(r.actual)})),record:rec})).catch(()=>null);
    res.setHeader('Cache-Control','public,max-age=0,s-maxage=120');
    return res.json({date,status,startHour,updated:day?.fetched_at||null,games:day?.games||0,covered:day?.covered||0,screened:Boolean(day?.insights_at),picks,record:track,claude});
  } catch {return res.status(503).json({error:'Daily insights are temporarily unavailable.'});}
}
