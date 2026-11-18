import {gameChart} from './game-chart.js';
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value=>new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
const hour = h=>(h%12||12)+(h<12?' AM':' PM');
const started = p=>Date.parse(p.tip)<=Date.now();
const words = {hit:'Hit',miss:'Miss',push:'Push',void:'Void'};
const graded = p=>p.result?words[p.result]+(p.actual==null?'':' ('+p.actual+')'):'';
const state = p=>p.result?'Final · '+graded(p):started(p)?'Game started':p.active?'Current':'Earlier suggestion';
const tag = p=>p.result?graded(p):started(p)?'Started':p.active?'Current':'Earlier';
const note = p=>p.result?(p.result==='void'?'The player did not play, so this suggestion is void and does not count.':'Graded against the final box score: '+esc(p.player)+' finished with '+p.actual+' '+esc(p.metric)+'.'):started(p)?'This game has started. The suggestion is kept as it was published before tip-off.':p.active?'Supported by the sportsbook lines saved at '+fmt(p.confirmed)+' ET. Prices move, so check the current line before relying on it.':'A later update re-checked this line and it no longer passed the filters. It stays listed for reference.';
const chip = {hit:'win',miss:'loss',push:'push',void:'pending'};
const day = d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
const signed = (n,d=2)=>(n>0?'+':'')+n.toFixed(d);
function trackRecord(r){
  if(!r)return '<p class="muted">The track record is unavailable right now.</p>';
  const total=r.hits+r.misses;
  const streak=r.streak?r.streak.count+' '+(r.streak.result==='hit'?(r.streak.count===1?'hit':'hits'):(r.streak.count===1?'miss':'misses'))+' in a row':'None yet';
  const extra=[r.pushes?r.pushes+' push'+(r.pushes===1?'':'es'):'',r.voids?r.voids+' void':'',r.pending?r.pending+' awaiting results':''].filter(Boolean).join(' · ');
  const tile=(label,value,foot)=>'<div class="kpi"><div class="kpi-top">'+label+'</div><div class="kpi-value">'+value+'</div><div class="kpi-foot">'+foot+'</div></div>';
  const tiles='<div class="kpi-grid">'+tile('Record',r.hits+'–'+r.misses,extra||'Every published insight, graded after its game')+tile('Hit rate',r.rate==null?'—':(100*r.rate).toFixed(0)+'%',total+' decided pick'+(total===1?'':'s'))+tile('Current streak',r.streak?(r.streak.result==='hit'?'W':'L')+r.streak.count:'—',streak+' · Best: '+r.best+' hit'+(r.best===1?'':'s'))+tile('Units',total?signed(r.units):'—','1 unit per pick at the suggested price')+'</div>';
  const days=r.days.length?'<div class="filter-row" style="margin-bottom:14px">'+r.days.map(d=>'<span class="pill'+(d.hits>d.misses?' lime':d.misses>d.hits?' red':'')+'">'+day(d.date)+': '+d.hits+'–'+d.misses+(d.pushes?'–'+d.pushes:'')+'</span>').join('')+'</div>':'';
  const rows=r.recent.map(x=>'<tr><td><span class="status-chip '+chip[x.result]+'">'+words[x.result]+'</span></td><td>'+day(x.date)+'</td><td><strong>'+esc(x.player)+'</strong></td><td>'+esc(x.side)+' '+x.line+' '+esc(x.metric)+(x.price?' · '+(x.price>0?'+':'')+x.price:'')+'</td><td>'+(x.actual==null?'—':x.actual)+'</td></tr>').join('');
  const table=rows?'<div class="tracker-table"><table style="min-width:520px"><thead><tr><th>RESULT</th><th>DATE</th><th>PLAYER</th><th>PICK</th><th>FINAL</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="muted">No insight has finished yet. Each one is graded about three hours after tip-off.</p>';
  const small=total<30?'<p class="notice">Small sample: '+total+' decided pick'+(total===1?'':'s')+' so far. A record this short says little about future results.</p>':'';
  return tiles+days+table+small;
}
class DailyInsights extends HTMLElement {
  connectedCallback(){
    this.innerHTML='<section class="card" style="margin-bottom:20px"><div class="card-body"><h1 class="page-title">Today’s Insights</h1><p data-info aria-live="polite">Comparing today’s sportsbook markets…</p><div data-layout style="display:flex;gap:18px;flex-wrap:wrap"><div data-list style="flex:1 1 210px;max-height:350px;overflow:auto"></div><div data-detail style="flex:2 1 280px;min-width:0"></div></div></div></section><section class="card" style="margin-bottom:20px"><div class="card-body"><h2 class="page-title" style="font-size:22px">Track record</h2><p class="muted small-text">Every insight this site has published, graded against the final box score at the line it was first suggested. Over wins above the line, Under below it. Pushes and players who sit out don’t count.</p><div data-record aria-live="polite"></div></div></section>';
    this.refresh();this.timer=setInterval(()=>this.refresh(),300000);
  }
  disconnectedCallback(){clearInterval(this.timer);}
  async refresh(){
    const info=this.querySelector('[data-info]'),list=this.querySelector('[data-list]'),detail=this.querySelector('[data-detail]');
    try{
      const response=await fetch('/api/insights');
      if(!response.ok)throw Error();
      const data=await response.json();
      this.querySelector('[data-record]').innerHTML=trackRecord(data.record);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const picks=data.date===today?data.picks:[];
      const messages={scheduled:'Today’s sportsbook lines are saved at about '+hour(data.startHour)+' ET. Insights appear after that.',pending:'Today’s update is on its way. Check back in a few minutes.','no-games':'No upcoming NBA games were found for today.','no-lines':'Sportsbooks have not posted today’s player lines yet. It will be checked again.',allowance:'Today’s update was skipped because the sportsbook data allowance is used up.',provider:'The sportsbook feed could not be reached. It will be retried.'};
      info.textContent=data.date!==today?'Waiting for today’s market update.':data.status==='ready'?data.date+' · Lines saved '+fmt(data.updated)+' ET · '+data.covered+'/'+data.games+' upcoming matchups checked'+(picks.length?' · Suggestions stay listed all day':''):messages[data.status]||messages.pending;
      list.replaceChildren();detail.replaceChildren();
      if(!picks.length){detail.textContent=data.date!==today||data.status!=='ready'?'':data.screened?'Pass for now. No verified line clears the recent-form, season and sportsbook filters.':'Checking today’s saved lines against recent form…';return;}
      const show=(p,button)=>{
        this.selected=p.key;
        for(const item of list.children)item.classList.toggle('primary',item===button);
        const games=p.games||[],hit=g=>p.side==='Over'?g.value>p.line:g.value<p.line;
        detail.innerHTML=`<div class="stat-profile"><div><small>${esc(p.away)} at ${esc(p.home)} · ${fmt(p.tip)} ET</small><h3>${esc(p.player)}</h3><strong>${esc(p.side)} ${p.line} ${esc(p.metric)} · ${p.price>0?'+':''}${p.price}</strong><small>${esc(p.book)} · Quoted ${fmt(p.updated)} ET</small><small>First suggested ${fmt(p.suggested)} ET · ${state(p)}</small></div>${p.photo?'<img style="width:95px" alt="" src="'+esc(p.photo)+'">':''}</div><p class="muted small-text">${note(p)}</p><p><strong>${p.hits10}/10 recent games</strong> · ${p.hits5}/5 most recent · ${p.seasonHits}/${p.seasonGames} this season finished ${esc(p.side.toLowerCase())} ${p.line}.</p><p><strong>+${(100*p.gap).toFixed(1)} percentage points</strong> between the offered price’s break-even rate and the median fair price from ${p.peers} other sportsbooks at this exact line.</p><p>Other books imply ${(100*p.consensus).toFixed(1)}% after removing their margin. This price requires ${(100*(p.consensus-p.gap)).toFixed(1)}% to break even.</p>${games.length?'<strong>'+games.filter(hit).length+' of '+games.length+' recent games finished '+p.side.toLowerCase()+' '+p.line+'</strong>'+gameChart(games,p.line):'<p>Recent game logs unavailable.</p>'}<button class="btn small">Research this line</button>`;
        detail.querySelector('button').onclick=()=>this.dispatchEvent(new CustomEvent('research-line',{bubbles:true,detail:{quote:p,date:data.date}}));
      };
      for(const p of picks){const b=document.createElement('button');b.className='btn';b.style.cssText='display:block;width:100%;text-align:left;margin:0 0 5px;white-space:normal';b.textContent=p.player+' · '+p.side+' '+p.line+' '+p.metric+' · '+p.hits10+'/10 · '+tag(p);b.onclick=()=>show(p,b);list.append(b);}
      list.children[Math.max(0,picks.findIndex(p=>p.key===this.selected))].click();
    }catch{info.textContent='Insights are unavailable. The next refresh will retry.';list.replaceChildren();detail.replaceChildren();this.querySelector('[data-record]').textContent='';}
  }
}
customElements.define('nba-insights',DailyInsights);
