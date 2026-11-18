// Shared rendering for graded track records (used by the Track record tab).
export const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const words = {hit:'Hit',miss:'Miss',push:'Push',void:'Void'};
export const chip = {hit:'win',miss:'loss',push:'push',void:'pending'};
const day = d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
const signed = (n,d=2)=>(n>0?'+':'')+n.toFixed(d);
export function trackRecord(r){
  if(!r)return '<p class="muted">The track record is unavailable right now.</p>';
  const total=r.hits+r.misses;
  const streak=r.streak?r.streak.count+' '+(r.streak.result==='hit'?(r.streak.count===1?'hit':'hits'):(r.streak.count===1?'miss':'misses'))+' in a row':'None yet';
  const extra=[r.pushes?r.pushes+' push'+(r.pushes===1?'':'es'):'',r.voids?r.voids+' void':'',r.pending?r.pending+' awaiting results':''].filter(Boolean).join(' · ');
  const tile=(label,value,foot)=>'<div class="kpi"><div class="kpi-top">'+label+'</div><div class="kpi-value">'+value+'</div><div class="kpi-foot">'+foot+'</div></div>';
  const tiles='<div class="kpi-grid">'+tile('Record',r.hits+'–'+r.misses,extra||'Every published pick, graded after its game')+tile('Hit rate',r.rate==null?'—':(100*r.rate).toFixed(0)+'%',total+' decided pick'+(total===1?'':'s'))+tile('Current streak',r.streak?(r.streak.result==='hit'?'W':'L')+r.streak.count:'—',streak+' · Best: '+r.best+' hit'+(r.best===1?'':'s'))+tile('Units',total?signed(r.units):'—','1 unit per pick at the suggested price')+'</div>';
  const days=r.days.length?'<div class="filter-row" style="margin-bottom:14px">'+r.days.map(d=>'<span class="pill'+(d.hits>d.misses?' lime':d.misses>d.hits?' red':'')+'">'+day(d.date)+': '+d.hits+'–'+d.misses+(d.pushes?'–'+d.pushes:'')+'</span>').join('')+'</div>':'';
  const rows=r.recent.map(x=>'<tr><td><span class="status-chip '+chip[x.result]+'">'+words[x.result]+'</span></td><td>'+day(x.date)+'</td><td><strong>'+esc(x.player)+'</strong></td><td>'+esc(x.side)+' '+x.line+' '+esc(x.metric)+(x.price?' · '+(x.price>0?'+':'')+x.price:'')+'</td><td>'+(x.actual==null?'—':x.actual)+'</td></tr>').join('');
  const table=rows?'<div class="tracker-table"><table style="min-width:520px"><thead><tr><th>RESULT</th><th>DATE</th><th>PLAYER</th><th>PICK</th><th>FINAL</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="muted">No pick has finished yet. Each one is graded about three hours after tip-off.</p>';
  const small=total<30?'<p class="notice">Small sample: '+total+' decided pick'+(total===1?'':'s')+' so far. A record this short says little about future results.</p>':'';
  return tiles+days+table+small;
}
