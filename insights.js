import {gameChart} from './game-chart.js';
import {chip} from './record-view.js';
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value=>new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
const hour = h=>(h%12||12)+(h<12?' AM':' PM');
const started = p=>Date.parse(p.tip)<=Date.now();
const words = {hit:'Hit',miss:'Miss',push:'Push',void:'Void'};
const graded = p=>p.result?words[p.result]+(p.actual==null?'':' ('+p.actual+')'):'';
const state = p=>p.result?'Final · '+graded(p):started(p)?'Game started':p.active?'Current':'Earlier suggestion';
const tag = p=>p.result?graded(p):started(p)?'Started':p.active?'Current':'Earlier';
const note = p=>p.result?(p.result==='void'?'The player did not play, so this suggestion is void and does not count.':'Graded against the final box score: '+esc(p.player)+' finished with '+p.actual+' '+esc(p.metric)+'.'):started(p)?'This game has started. The suggestion is kept as it was published before tip-off.':p.active?'Supported by the sportsbook lines saved at '+fmt(p.confirmed)+' ET. Prices move, so check the current line before relying on it.':'A later update re-checked this line and it no longer passed the filters. It stays listed for reference.';
function claudePicks(c,date){
  if(!c)return '<p class="muted">Claude’s picks are unavailable right now.</p>';
  const cards=c.picks.map(p=>'<div class="insight" style="margin-bottom:10px"><div class="insight-tag">'+esc(p.away)+' AT '+esc(p.home)+' · '+fmt(p.tip)+' ET'+(p.result?' · <span class="status-chip '+chip[p.result]+'">'+graded(p)+'</span>':'')+'</div><strong>'+esc(p.player)+' · '+esc(p.side)+' '+p.line+' '+esc(p.metric)+' · '+(p.price>0?'+':'')+p.price+' '+esc(p.book)+'</strong><p>'+esc(p.reason)+'</p></div>').join('');
  const none='<p class="muted">'+(new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',hour12:false})<16?'Today’s picks are posted around 4 PM ET.':'No pick today. Nothing stood out enough after the research.')+'</p>';
  const r=c.record,total=r?r.hits+r.misses:0;
  return (cards||none)+'<p class="small-text muted">Claude’s record so far: '+(r?r.hits+'–'+r.misses+(r.streak?' · Streak '+(r.streak.result==='hit'?'W':'L')+r.streak.count:''):'unavailable')+' · <a class="text-link" href="#record">Full track record →</a></p>';
}
class DailyInsights extends HTMLElement {
  connectedCallback(){
    this.innerHTML='<section class="card" style="margin-bottom:20px"><div class="card-body"><h1 class="page-title">Today’s Insights</h1><p data-info aria-live="polite">Comparing today’s sportsbook markets…</p><div data-layout style="display:flex;gap:18px;flex-wrap:wrap"><div data-list style="flex:1 1 210px;max-height:350px;overflow:auto"></div><div data-detail style="flex:2 1 280px;min-width:0"></div></div></div></section><section class="card" style="margin-bottom:20px"><div class="card-body"><h2 class="page-title" style="font-size:22px">Claude’s picks</h2><p class="muted small-text">Lines chosen each afternoon by Claude, an AI model, after reading injury news, rotation changes and matchups against today’s saved sportsbook prices. Graded the same way, with a separate record. This is research, not a guarantee.</p><div data-claude aria-live="polite"></div></div></section>';
    this.refresh();this.timer=setInterval(()=>this.refresh(),300000);
  }
  disconnectedCallback(){clearInterval(this.timer);}
  async refresh(){
    const info=this.querySelector('[data-info]'),list=this.querySelector('[data-list]'),detail=this.querySelector('[data-detail]');
    try{
      const response=await fetch('/api/insights');
      if(!response.ok)throw Error();
      const data=await response.json();
      this.querySelector('[data-claude]').innerHTML=claudePicks(data.claude,data.date);
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
    }catch{info.textContent='Insights are unavailable. The next refresh will retry.';list.replaceChildren();detail.replaceChildren();this.querySelector('[data-claude]').textContent='';}
  }
}
customElements.define('nba-insights',DailyInsights);
