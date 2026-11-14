import { upcoming, quotes } from '../market-feed.js';
import { directory, card } from '../player-feed.js';
const eastern = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const implied = price => price < 0 ? -price/(100-price) : 100/(100+price);
const normalize = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function candidates(game,rows,now) {
  const groups = new Map();
  for (const row of rows) {
    const age = now - Date.parse(row.updated);
    if (!(age >= 0 && age <= 3600000) || !row.Over || !row.Under) continue;
    const key = JSON.stringify([row.player,row.metric,row.line]);
    if (!groups.has(key)) groups.set(key,new Map());
    groups.get(key).set(row.book,row);
  }
  const picks = [];
  for (const books of groups.values()) {
    if (books.size < 3) continue;
    for (const row of books.values()) for (const side of ['Over','Under']) {
      const peers = [...books.values()].filter(b=>b.book!==row.book);
      const probabilities = peers.map(b=>implied(b[side])/(implied(b.Over)+implied(b.Under))).sort((a,b)=>a-b);
      const middle = Math.floor(probabilities.length/2);
      const consensus = (probabilities[middle]+probabilities[Math.floor((probabilities.length-1)/2)])/2;
      const gap = consensus-implied(row[side]);
      if (gap <= 0) continue;
      picks.push({...row,side,price:row[side],gap,consensus,peers:peers.length,home:game.home,away:game.away,tip:game.tip||game.commence_time});
    }
  }
  return picks;
}
async function generate(date) {
  const games = await upcoming(date);
  const results = await Promise.allSettled(games.map(async g=>candidates({home:g.home_team,away:g.away_team,tip:g.commence_time},await quotes(g.id),Date.now())));
  const covered = results.filter(r=>r.status==='fulfilled');
  if (games.length && !covered.length) throw Error('Markets unavailable');
  const used = new Set(), picks = [];
  for (const p of covered.flatMap(r=>r.value).sort((a,b)=>b.gap-a.gap)) {
    if (used.has(p.player)) continue;
    picks.push(p); used.add(p.player);
    if (picks.length===8) break;
  }
  if (picks.length) {
    const players = await directory().catch(()=>[]);
    await Promise.all(picks.map(async p=>{
      const matches=players.filter(a=>normalize(a.name)===normalize(p.player));
      if(matches.length!==1)return;
      const a=matches[0];
      const data=await card({player:a.id,team:a.team,date,metric:p.metric}).catch(()=>null);
      if(data) {p.photo=data.photo;p.games=data.games.slice(0,10);}
    }));
  }
  return {date,updated:new Date().toISOString(),games:games.length,covered:covered.length,picks};
}
let saved;
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).end();
  const date=eastern.format(new Date());
  try {
    if(!saved || saved.date!==date || saved.until<Date.now()) saved={date,until:Date.now()+1800000,result:generate(date)};
    const data=await saved.result;
    res.setHeader('Cache-Control','public,max-age=0,s-maxage=1800');
    return res.json(data);
  } catch {saved=null;return res.status(503).json({error:'Daily insights are temporarily unavailable.'});}
}
