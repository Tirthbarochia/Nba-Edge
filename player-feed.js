const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const common = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const metrics = {points:['points'],rebounds:['totalRebounds'],assists:['assists'],PRA:['points','totalRebounds','assists']};
const eastern = date => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
// Identical ESPN requests made within two minutes share one response, so building the daily
// insights does not re-download the same scoreboard, roster or game log for every line.
const recent = new Map();
async function json(url) {
  const saved=recent.get(url);
  if(saved && saved.until>Date.now()) return saved.result;
  for(const [key,entry] of recent) if(entry.until<=Date.now()) recent.delete(key);
  const result=fetch(url,{signal:AbortSignal.timeout(9000)}).then(r=>{
    if(!r.ok) throw Error('Feed unavailable');
    return r.json();
  });
  const entry={until:Date.now()+120000,result};
  recent.set(url,entry);
  try { return await result; }
  catch(error){ if(recent.get(url)===entry) recent.delete(url); throw error; }
}
// Clears the shared response cache (used by tests).
export const forget = () => recent.clear();
export async function directory() {
  const teams=(await json(site+'/teams?limit=100')).sports[0].leagues[0].teams;
  const rosters=await Promise.all(teams.map(async ({team})=>{
    const roster=await json(site+'/teams/'+team.id+'/roster');
    return roster.athletes.map(a=>({id:a.id,name:a.displayName,team:team.id,club:team.abbreviation,flagged:(a.injuries||[]).some(i=>/out|questionable|doubtful|day.to.day|suspend|inactive/i.test(String(i.status?.description||i.status||i.type?.description||"")))}));
  }));
  return rosters.flat();
}
export async function card(q) {
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
  const minuteIndex=log.names?.indexOf('minutes') ?? -1;
  const games=new Map();
  for(const group of log.seasonTypes||[]) {
    if(!/regular season/i.test(group.displayName))continue;
    for(const category of group.categories||[]) for(const row of category.events||[]){
      const game=log.events?.[row.eventId];
      if(!game?.gameDate||!['W','L'].includes(game.gameResult))continue;
      const day=eastern(game.gameDate), values=cols.map(i=>row.stats?.[i]);
      if(day>=date||!values.every(v=>/^\d+$/.test(String(v))))continue;
      games.set(row.eventId,{date:day,minutes:row.stats?.[minuteIndex] ?? null,opponent:game.opponent.abbreviation,value:values.reduce((s,v)=>s+Number(v),0)});
    }
  }
  return {name:athlete.displayName,club:roster.team.abbreviation,photo:athlete.headshot?.href,date,metric,opponent:opponent?.abbreviation||null,status:event?.status.type.shortDetail||null,games:[...games.values()].sort((a,b)=>b.date.localeCompare(a.date)),aiAvailable:Boolean(process.env.OPENAI_API_KEY)};
}

// Final result of one player's stat in his team's game on `date` (Eastern), for grading.
// Returns {status:'final', value}, {status:'pending'} while the game is unfinished,
// {status:'missing'} when the game is over but the player has no box score line, or
// {status:'no-game'} when his team did not play that day.
export async function outcome({player,team,metric,date}) {
  const names=metrics[metric];
  if(!/^\d{1,9}$/.test(player)||!/^\d{1,2}$/.test(team)||!Array.isArray(names)||!/^20\d{2}-\d\d-\d\d$/.test(date)) return null;
  const board=await json(site+'/scoreboard?dates='+date.replaceAll('-',''));
  const event=board.events.find(e=>eastern(e.date)===date && e.competitions[0].competitors.some(c=>c.team.id===team));
  if(!event) return {status:'no-game'};
  if(!event.status?.type?.completed) return {status:'pending'};
  const log=await json(common+'/athletes/'+player+'/gamelog?season='+event.season.year);
  const cols=names.map(n=>log.names?.indexOf(n)??-1);
  for(const group of log.seasonTypes||[]) for(const category of group.categories||[]) for(const row of category.events||[]) {
    const game=log.events?.[row.eventId];
    if(!game?.gameDate||(row.eventId!==event.id&&eastern(game.gameDate)!==date)||!['W','L'].includes(game.gameResult))continue;
    const values=cols.map(i=>row.stats?.[i]);
    if(values.every(v=>/^\d+$/.test(String(v)))) return {status:'final',value:values.reduce((sum,v)=>sum+Number(v),0)};
  }
  return {status:'missing'};
}
