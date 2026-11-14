const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function gameChart(games, line) {
  if (!games.length) return '<p>No games in this window.</p>';
  const scale = 1.2 * Math.max(1, line ?? 0, ...games.map(g => g.value));
  const columns = [...games].reverse().map(g => {
    const outcome = line == null ? '' : g.value > line ? 'Over' : g.value < line ? 'Under' : 'Push';
    const color = {Over:'#4ade80',Under:'#fb6577',Push:'#c3ccda','':'#77cada'}[outcome];
    const height = 100 * g.value / scale;
    return `<div style="flex:1 0 60px;text-align:center"><div style="position:relative;height:150px;display:flex;justify-content:center;align-items:flex-end"><div style="width:50%;height:${height}%;min-height:1px;background:${color};border-radius:3px 3px 0 0"></div><b style="position:absolute;bottom:${height}%;z-index:2;background:#142335;border-radius:3px;padding:0 3px">${escape(g.value)}</b></div><small style="display:block">${escape(g.date.slice(5))}<br>${escape(g.opponent)}<br>${outcome}${g.minutes!=null?'<br>'+escape(g.minutes)+' min':''}</small></div>`;
  }).join('');
  const marker = line == null ? '' : `<div aria-hidden="true" style="position:absolute;top:${150*(1-line/scale)}px;left:0;right:0;border-top:2px dashed #c8daec;pointer-events:none"></div>`;
  return `<div style="max-width:100%;min-width:0;overflow-x:auto;margin:12px 0">${line==null?'':'<small>Dashed line · '+escape(line)+'</small>'}<div style="position:relative;display:flex;width:max-content;min-width:100%;background:#142335;border-radius:6px">${columns}${marker}</div></div>`;
}
