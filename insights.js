const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value=>new Date(value).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
class DailyInsights extends HTMLElement {
  connectedCallback(){
    this.innerHTML='<section class="card" style="margin-bottom:20px"><div class="card-body"><h1 class="page-title">Today’s Insights</h1><p data-info aria-live="polite">Comparing today’s sportsbook markets…</p><div data-layout style="display:flex;gap:18px;flex-wrap:wrap"><div data-list style="flex:1 1 210px;max-height:350px;overflow:auto"></div><div data-detail style="flex:2 1 280px;min-width:0"></div></div></div></section>';
    this.refresh();this.timer=setInterval(()=>this.refresh(),300000);
  }
  disconnectedCallback(){clearInterval(this.timer);}
  async refresh(){
    const info=this.querySelector('[data-info]'),list=this.querySelector('[data-list]'),detail=this.querySelector('[data-detail]');
    try{
      const response=await fetch('/api/insights');
      if(!response.ok)throw Error();
      const data=await response.json();
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const picks=data.date===today?data.picks.filter(p=>Date.parse(p.tip)>Date.now() && Date.now()-Date.parse(p.updated)<=3600000):[];
      info.textContent=data.date!==today?'Waiting for today’s market update.':data.date+' · Updated '+fmt(data.updated)+' ET · '+data.covered+'/'+data.games+' upcoming matchups checked';
      list.replaceChildren();detail.replaceChildren();
      if(!picks.length){detail.textContent='No qualifying price comparisons on the current slate.';return;}
      const show=(p,button)=>{
        this.selected=p.player;
        for(const item of list.children)item.classList.toggle('primary',item===button);
        const games=p.games||[],hit=g=>p.side==='Over'?g.value>p.line:g.value<p.line;
        detail.innerHTML=`<div class="stat-profile"><div><small>${esc(p.away)} at ${esc(p.home)} · ${fmt(p.tip)} ET</small><h3>${esc(p.player)}</h3><strong>${esc(p.side)} ${p.line} ${esc(p.metric)} · ${p.price>0?'+':''}${p.price}</strong><small>${esc(p.book)} · Quoted ${fmt(p.updated)} ET</small></div>${p.photo?'<img style="width:95px" alt="" src="'+esc(p.photo)+'">':''}</div><p><strong>+${(100*p.gap).toFixed(1)} percentage points</strong> between the offered price’s break-even rate and the median fair price from ${p.peers} other sportsbooks at this exact line.</p><p>Other books imply ${(100*p.consensus).toFixed(1)}% after removing their margin. This price requires ${(100*(p.consensus-p.gap)).toFixed(1)}% to break even.</p>${games.length?'<strong>'+games.filter(hit).length+' of '+games.length+' recent games finished '+p.side.toLowerCase()+' '+p.line+'</strong><div style="display:flex;gap:5px;flex-wrap:wrap;margin:8px 0">'+games.map(g=>'<span title="'+esc(g.date)+' vs '+esc(g.opponent)+'" style="padding:5px 8px;background:#182b40;border-radius:5px;color:'+(g.value===p.line?'#c3ccda':g.value>p.line?'#4ade80':'#fb6577')+'">'+g.value+'</span>').join('')+'</div>':'<p>Recent game logs unavailable.</p>'}<button class="btn small">Research this line</button>`;
        detail.querySelector('button').onclick=()=>this.dispatchEvent(new CustomEvent('research-line',{bubbles:true,detail:{quote:p,date:data.date}}));
      };
      for(const p of picks){const b=document.createElement('button');b.className='btn';b.style.cssText='display:block;width:100%;text-align:left;margin:0 0 5px';b.textContent=p.player+' · '+p.side+' '+p.line+' '+p.metric;b.onclick=()=>show(p,b);list.append(b);}
      list.children[Math.max(0,picks.findIndex(p=>p.player===this.selected))].click();
    }catch{info.textContent='Insights are unavailable. The next refresh will retry.';list.replaceChildren();detail.replaceChildren();}
  }
}
customElements.define('nba-insights',DailyInsights);
