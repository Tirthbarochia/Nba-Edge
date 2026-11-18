// Daily insight rules, moved unchanged from api/insights.js so they can run on the saved
// sportsbook snapshot. They are a sportsbook research screen, not a calibrated forecast.
import { directory, card } from './player-feed.js';
const implied = price => price < 0 ? -price/(100-price) : 100/(100+price);
export const normalize = name => name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Stable identity of one suggestion within a day: player, stat, exact line and side.
export const pickKey = pick => [normalize(pick.player), pick.metric.toLowerCase(), String(pick.line).replace('.','p'), pick.side.toLowerCase()].join('_');

export function candidates(game,rows,now) {
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
      if (gap < 0.01 || consensus <= 0.5) continue;
      picks.push({...row,side,price:row[side],gap,consensus,peers:peers.length,home:game.home,away:game.away,tip:game.tip});
    }
  }
  return picks;
}
export function screen(quote,games) {
  const hit = g => quote.side==='Over' ? g.value>quote.line : g.value<quote.line;
  const hits10 = games.slice(0,10).filter(hit).length;
  const hits5 = games.slice(0,5).filter(hit).length;
  const seasonHits = games.filter(hit).length;
  if (games.length<10 || hits10<7 || hits5<3 || seasonHits/games.length<0.55) return null;
  return {hits10,hits5,seasonHits,seasonGames:games.length};
}
// games: [{home,away,tip,rows}] from one saved snapshot; now: when that snapshot was taken.
export async function generate(date,games,now) {
  const pool = games.flatMap(g => candidates(g,g.rows,now));
  const players = pool.length ? await directory() : [];
  const grouped = new Map();
  for (const quote of pool) {
    const key = normalize(quote.player)+'|'+quote.metric;
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(quote);
  }
  const qualified = [];
  const groups = [...grouped.values()];
  for (let i=0; i<groups.length; i+=8) {
    await Promise.all(groups.slice(i,i+8).map(async offers => {
      const first = offers[0];
      const matches = players.filter(a => normalize(a.name)===normalize(first.player));
      if (matches.length!==1) return;
      const athlete = matches[0];
      if (athlete.flagged) return;
      const data = await card({player:athlete.id,team:athlete.team,date,metric:first.metric}).catch(()=>null);
      if (!data?.opponent || data.games.length<10) return;
      for (const quote of offers) {
        const evidence = screen(quote,data.games);
        if (evidence) qualified.push({...quote,...evidence,athlete:athlete.id,team:athlete.team,photo:data.photo,games:data.games.slice(0,10)});
      }
    }));
  }
  qualified.sort((a,b)=>b.consensus-a.consensus || b.hits10-a.hits10 || b.gap-a.gap);
  const used = new Set(), picks = [];
  for (const pick of qualified) {
    if (used.has(pick.player)) continue;
    used.add(pick.player); picks.push(pick);
    if (picks.length===8) break;
  }
  return picks;
}
