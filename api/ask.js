import {directory,card} from '../player-feed.js';
export default async function handler(req,res){
  try{
    if(req.method==='GET' && req.query.directory==='1'){
      const players=await directory();
      res.setHeader('Cache-Control','public,s-maxage=3600,stale-while-revalidate=86400');
      return res.json({players});
    }
    if(!['GET','POST'].includes(req.method))return res.status(405).end();
    const explain=req.method==='POST';
    if(explain){
      if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI explanations are awaiting activation.'});
      const token=req.headers.authorization;
      if(!/^Bearer \S+$/.test(token||''))return res.status(401).json({error:'Sign in to request an AI explanation.'});
      const auth=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:token},signal:AbortSignal.timeout(5000)});
      if(!auth.ok)return res.status(401).json({error:'Sign in again to request an AI explanation.'});
    }
    const q=explain?req.body:req.query;
    const result=await card(q||{});
    if(!result)return res.status(400).json({error:'Select a current NBA player, date and stat.'});
    if(!explain){
      res.setHeader('Cache-Control','public,s-maxage=90');
      return res.json(result);
    }
    const n=Number(q.window), threshold=Number(q.line);
    if(![5,10,15,20,82].includes(n)||q.line===''||!Number.isFinite(threshold)||threshold<0||threshold>250)return res.status(400).json({error:'Select a valid line and window.'});
    const sample=n===82?result.games:result.games.slice(0,n);
    if(!sample.length)return res.status(400).json({error:'No qualifying games to explain.'});
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(18000),body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:180,instructions:'Explain the supplied NBA game sample in two concise sentences. Report clears/appearances and any relevant opponent sample. Use the supplied target side. Over and Under are strict; equality is a push. At least is inclusive. Use only supplied data. Do not forecast odds, give betting advice, infer injuries, or invent context.',input:JSON.stringify({player:result.name,metric:result.metric,opponent:result.opponent,line:threshold,side:['Over','Under','At least'].includes(q.side)?q.side:'Over',games:sample})})});
    if(!response.ok)throw Error('AI unavailable');
    const payload=await response.json();
    const answer=payload.output?.flatMap(i=>i.content||[]).find(c=>c.type==='output_text')?.text;
    if(!answer)throw Error('AI unavailable');
    return res.json({answer});
  } catch{return res.status(502).json({error:'The research feed is temporarily unavailable. Try again.'});}
}

