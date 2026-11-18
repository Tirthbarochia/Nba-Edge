const site = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const common = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const metrics = {points:['points'],rebounds:['totalRebounds'],assists:['assists'],PRA:['points','totalRebounds','assists']};
import { projectAll } from './projection.js';
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
export async function card(q, {model=false}={}) {
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
  const statIndex={points:log.names?.indexOf('points')??-1,rebounds:log.names?.indexOf('totalRebounds')??-1,assists:log.names?.indexOf('assists')??-1};
  const detail=new Map();
  const games=new Map();
  for(const group of log.seasonTypes||[]) {
    if(!/regular season/i.test(group.displayName))continue;
    for(const category of group.categories||[]) for(const row of category.events||[]){
      const game=log.events?.[row.eventId];
      if(!game?.gameDate||!['W','L'].includes(game.gameResult))continue;
      const day=eastern(game.gameDate), values=cols.map(i=>row.stats?.[i]);
      if(day>=date||!values.every(v=>/^\d+$/.test(String(v))))continue;
      games.set(row.eventId,{date:day,minutes:row.stats?.[minuteIndex] ?? null,opponent:game.opponent.abbreviation,value:values.reduce((s,v)=>s+Number(v),0)});
      const all=Object.fromEntries(Object.entries(statIndex).map(([k,i])=>[k,Number(row.stats?.[i])]));
      detail.set(row.eventId,{event:row.eventId,date:day,minutes:parseFloat(String(row.stats?.[minuteIndex]??''))||0,home:game.atVs==='vs',team:game.team?.id,values:all});
    }
  }
  const result={name:athlete.displayName,club:roster.team.abbreviation,photo:athlete.headshot?.href,date,metric,opponent:opponent?.abbreviation||null,status:event?.status.type.shortDetail||null,games:[...games.values()].sort((a,b)=>b.date.localeCompare(a.date)),aiAvailable:Boolean(process.env.OPENAI_API_KEY)};
  if(model && event && opponent) result.model=await matchup({player,team,date,metric,season,event,opponent,roster,athlete,rows:[...detail.values()].filter(r=>r.date<date&&STATS_OK(r)).sort((a,b)=>b.date.localeCompare(a.date))}).catch(()=>null);
  return result;
}
const STATS_OK=r=>['points','rebounds','assists'].every(k=>Number.isFinite(r.values[k]));
const injury=a=>String(a?.injuries?.[0]?.status||'');
const statNames={points:['offensive','avgPoints'],rebounds:['general','avgRebounds'],assists:['offensive','avgAssists']};

// What each team allows per game (from ESPN's opponent splits) and the league average.
async function defenses(season){
  const data=await json(common+'/statistics/byteam?season='+season+'&seasontype=2');
  const names=Object.fromEntries((data.categories||[]).filter(c=>c.names).map(c=>[c.name,c.names]));
  const teams=(data.teams||[]).map(t=>{
    const opp=name=>t.categories?.find(c=>c.name===name&&String(c.splitId)==='900');
    const allowed=Object.fromEntries(Object.entries(statNames).map(([stat,[cat,key]])=>[stat,Number(opp(cat)?.values?.[names[cat]?.indexOf(key)])]));
    const games=Number(t.categories?.find(c=>c.name==='general'&&String(c.splitId)==='0')?.values?.[names.general?.indexOf('gamesPlayed')]);
    return {id:String(t.team?.id),abbr:t.team?.abbreviation,allowed,games};
  }).filter(t=>Object.values(t.allowed).every(Number.isFinite));
  const league=Object.fromEntries(Object.keys(statNames).map(s=>[s,teams.reduce((a,t)=>a+t.allowed[s],0)/Math.max(1,teams.length)]));
  return {teams,league};
}

// Adds tonight's context (venue, opponent, teammates out) and returns the projection for the stat.
async function matchup({player,team,date,metric,season,event,opponent,roster,athlete,rows}){
  const me=event.competitions[0].competitors.find(c=>c.team.id===team);
  const home=me?.homeAway?me.homeAway==='home':null;
  const [def,mates]=await Promise.all([
    defenses(season).catch(()=>null),
    Promise.all((roster.athletes||[]).filter(a=>a.id!==player&&/^(out|doubtful)$/i.test(injury(a))).slice(0,4).map(async a=>{
      const log=await json(common+'/athletes/'+a.id+'/gamelog?season='+season).catch(()=>null);
      const mi=log?.names?.indexOf('minutes')??-1, played=new Set(), dates=[];let minutes=0;
      for(const group of log?.seasonTypes||[]) for(const category of group.categories||[]) for(const row of category.events||[]){
        const g=log.events?.[row.eventId];
        if(!g?.gameDate||g.team?.id!==team||!['W','L'].includes(g.gameResult)||eastern(g.gameDate)>=date)continue;
        if(!played.has(row.eventId)){played.add(row.eventId);dates.push(eastern(g.gameDate));minutes+=parseFloat(String(row.stats?.[mi]??''))||0;}
      }
      return {name:a.displayName,status:injury(a),played,first:dates.sort()[0],games:played.size,minutes:played.size?minutes/played.size:0};
    }))
  ]);
  // Only regular contributors count; a teammate who has not played this season is already reflected.
  const out=mates.filter(m=>m.games>=5&&m.minutes>=15);
  const games=rows.filter(r=>r.team===team||!r.team).map(r=>({...r,without:out.length>0&&out.every(m=>!m.played.has(r.event)&&r.date>=m.first)}));
  const opp=def?.teams.find(t=>t.id===String(opponent.id));
  const opponents=opp?Object.fromEntries(Object.keys(statNames).map(s=>[s,{team:opp.abbr,allowed:opp.allowed[s],league:def.league[s],games:opp.games||0}])):{};
  const all=projectAll(games,{home,opponents,teammatesOut:out.map(m=>m.name)});
  const model=all[metric];
  if(!model)return null;
  const notes=[];
  if(/questionable|doubtful|out|day/i.test(injury(athlete)))notes.push(athlete.displayName+' is listed '+injury(athlete).toLowerCase()+'.');
  const unsure=(roster.athletes||[]).filter(a=>a.id!==player&&/questionable/i.test(injury(a))).map(a=>a.displayName);
  if(unsure.length)notes.push('Questionable, not adjusted for: '+unsure.slice(0,4).join(', ')+'.');
  if(!def)notes.push('Opponent defense data was unavailable.');
  return {...model,notes,home,opponentAbbr:opponent.abbreviation};
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
