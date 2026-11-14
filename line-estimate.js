export function parseSearch(input) {
  const match=input.trim().match(/^(.+?)\s+(?:(over|under|at least)\s+)?(\d+(?:\.\d+)?)(\+)?\s+(points?|pts|rebounds?|reb|assists?|ast|pra)$/i);
  if (!match) return {name:input};
  const stat=match[5].toLowerCase();
  const metric=stat==='pra'?'PRA':/^(a)/.test(stat)?'assists':/^r/.test(stat)?'rebounds':'points';
  const side=match[4]||match[2]?.toLowerCase()==='at least'?'At least':match[2]?.toLowerCase()==='under'?'Under':'Over';
  return {name:match[1],preset:{metric,line:Number(match[3]),side}};
}
export function outcome(value,line,side) {
  if (side==='At least') return value>=line?'Hit':'Miss';
  if (value===line) return 'Push';
  return (side==='Under'?value<line:value>line)?'Hit':'Miss';
}
export function estimate(games,line,side) {
  if (games.length<5) return null;
  if (line===0 && side==='At least') return 100;
  if (line===0 && side==='Under') return 0;
  // One prior count per possible settlement, with a ten-appearance half-life.
  const pushPossible=Number.isInteger(line)&&side!=='At least';
  let total=pushPossible && line>0?3:2, hits=1;
  games.forEach((game,index)=>{
    const weight=2**(-index/10);
    total+=weight;
    if (outcome(game.value,line,side)==='Hit') hits+=weight;
  });
  return Math.round(100*hits/total);
}
