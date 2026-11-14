const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const common = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const metrics = {points:['points'],rebounds:['totalRebounds'],assists:['assists'],PRA:['points','totalRebounds','assists']};
const eastern = date => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
async function json(url) {
  const r=await fetch(url,{signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw Error('Feed unavailable');
  return r.json();
}
async function directory() {
  const teams=(await json(site+'/teams?limit=100')).sports[0].leagues[0].teams;
  const rosters=await Promise.all(teams.map(async ({team})=>{
    const roster=await json(site+'/teams/'+team.id+'/roster');
    return roster.athletes.map(a=>({id:a.id,name:a.displayName,team:team.id,club:team.abbreviation}));
  }));
  return rosters.flat();
}
async function card(q) {
  const {player,team,metric,date}=q;
  const names=metrics[metric];
  if(!/^\d{1,9}$/.test(player)||!/^\d{1,2}$/.test(team)||!Array.isArray(names)||!/^20\d{2}-\d\d-\d\d$/.test(date)) return null;
  const [board,roster]=await Promise.all([json(site+'/scoreboard?dates='+date.replaceAll('-','')),json(site+'/teams/'+team+'/roster')]);
  const athlete=roster.athletes.find(a=>a.id===player);
  if(!athlete)return null;
  const event=board.events.find(e=>eastern(e.date)===date && e.competitions[0].competitors.some(c=>c.team.id===team));
  const opponent=event?.competitions[0].competitors.find(c=>c.team.id!==team)?.team;
  const season=event?.season.year || (Number(date.slice(0,4))+(Number(date.slice(5,7))>=10?1:0));
  const log=await json(common+'/athletes/'+player+'/gamelog?season='+season);
  const cols=names.map(n=>log.names?.indexOf(n)??-1);
  const games=new Map();
  for(const group of log.seasonTypes||[]) {
    if(!/regular season/i.test(group.displayName))continue;
    for(const category of group.categories||[]) for(const row of category.events||[]){
      const game=log.events?.[row.eventId];
      if(!game?.gameDate||!['W','L'].includes(game.gameResult))continue;
      const day=eastern(game.gameDate), values=cols.map(i=>row.stats?.[i]);
      if(day>=date||!values.every(v=>/^\d+$/.test(String(v))))continue;
      games.set(row.eventId,{date:day,opponent:game.opponent.abbreviation,value:values.reduce((s,v)=>s+Number(v),0)});
    }
  }
  return {name:athlete.displayName,club:roster.team.abbreviation,photo:athlete.headshot?.href,date,metric,opponent:opponent?.abbreviation||null,status:event?.status.type.shortDetail||null,games:[...games.values()].sort((a,b)=>b.date.localeCompare(a.date)),aiAvailable:Boolean(process.env.OPENAI_API_KEY)};
}
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
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(18000),body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:180,instructions:'Explain the supplied NBA game sample in two concise sentences. Report clears/appearances and any relevant opponent sample. A clear means strictly above the line. Use only supplied data. Do not forecast odds, give betting advice, infer injuries, or invent context.',input:JSON.stringify({player:result.name,metric:result.metric,opponent:result.opponent,line:threshold,games:sample})})});
    if(!response.ok)throw Error('AI unavailable');
    const payload=await response.json();
    const answer=payload.output?.flatMap(i=>i.content||[]).find(c=>c.type==='output_text')?.text;
    if(!answer)throw Error('AI unavailable');
    return res.json({answer});
  } catch{return res.status(502).json({error:'The research feed is temporarily unavailable. Try again.'});}
}
