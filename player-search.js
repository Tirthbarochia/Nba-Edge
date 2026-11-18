import {parseSearch,outcome,estimate} from './line-estimate.js';
import {lineChance} from './projection.js';
import {gameChart} from './game-chart.js';
const escape = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
let directory;
async function request(url,options){
  const response=await fetch(url,options);
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Could not load research.');
  return data;
}
class PlayerSearch extends HTMLElement {
  connectedCallback(){
    this.innerHTML=`<section class="card" style="margin-bottom:20px"><div class="card-body"><h2>Find a player</h2><form style="display:flex;gap:8px"><input name="search" class="search" aria-label="Player name" placeholder="Player or line, e.g. Kuminga 2+ assists" required maxlength="80" style="flex:1;min-width:0"><button class="btn primary">Search</button></form><div data-matches aria-live="polite"></div><div data-card></div></div></section>`;
    this.form=this.querySelector('form');
    this.matches=this.querySelector('[data-matches]');
    this.output=this.querySelector('[data-card]');
    this.form.onsubmit=async e=>{
      e.preventDefault();
      const query=parseSearch(this.form.elements.search.value);
      const term=normalize(query.name);
      const preset=this.pendingLine || query.preset; this.pendingLine=null;
      if(!term)return;
      const seq=this.version=(this.version||0)+1;
      this.output.innerHTML='';
      this.matches.textContent='Searching NBA rosters…';
      try{
        directory ||= request('/api/ask?directory=1').catch(error=>{directory=null;throw error;});
        const {players}=await directory;
        if(this.version!==seq)return;
        const found=players.filter(p=>normalize(p.name).includes(term));
        const exact=found.filter(p=>normalize(p.name)===term);
        if(found.length===1||exact.length===1){this.choose(exact[0]||found[0],preset);return;}
        this.matches.textContent=found.length?'Select a player':'No player found on current NBA rosters.';
        for(const player of found.slice(0,20)){
          const button=document.createElement('button');
          button.className='btn small';button.textContent=player.name+' · '+player.club;
          button.onclick=()=>this.choose(player,preset);this.matches.append(' ',button);
        }
      }catch(error){if(seq===this.version)this.matches.textContent=error.message;}
    };
  }
  openLine(quote,date){
    this.pendingLine={date,metric:quote.metric,line:quote.line,side:quote.side};
    this.form.elements.search.value=quote.player;
    this.form.requestSubmit();
  }
  choose(player,preset){
    this.version=(this.version||0)+1;this.player=player;
    this.matches.textContent='';this.form.elements.search.value=player.name;
    this.output.innerHTML=`<div class="field-row" style="margin-top:16px;flex-wrap:wrap"><label class="field">Game date<input name="day" type="date"></label><label class="field">Stat<select name="metric"><option value="points">Points</option><option value="rebounds">Rebounds</option><option value="assists">Assists</option><option>PRA</option></select></label><label class="field">Target<select name="side"><option>Over</option><option>Under</option><option>At least</option></select></label><label class="field">Your line<input name="line" type="number" min="0" max="250" step="0.5" placeholder="Enter line"></label><label class="field">Window<select name="window">${[5,10,15,20,82].map(n=>'<option value="'+n+'" '+(n===10?'selected':'')+'>'+(n===82?'Season':'Last '+n)+'</option>').join('')}</select></label></div><div data-panel aria-live="polite"></div>`;
    const field=name=>this.output.querySelector('[name="'+name+'"]');
    this.day=field('day');this.metric=field('metric');this.side=field('side');this.line=field('line');this.window=field('window');this.panel=this.output.querySelector('[data-panel]');
    this.day.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(preset){if(preset.date)this.day.value=preset.date;this.side.value=preset.side||'Over';this.metric.value=preset.metric;this.line.value=preset.line;}
    this.day.onchange=this.metric.onchange=()=>this.load();
    this.side.onchange=this.line.oninput=this.window.onchange=()=>this.draw();
    this.load();
  }
  args(){return {player:this.player.id,team:this.player.team,date:this.day.value,metric:this.metric.value};}
  async load(){
    const seq=++this.version;this.data=null;this.panel.textContent='Loading game logs…';
    try{
      const data=await request('/api/ask?'+new URLSearchParams(this.args()));
      if(seq!==this.version)return;
      this.data=data;this.draw();
    }catch(error){if(seq===this.version)this.panel.textContent=error.message;}
  }
  draw(){
    const d=this.data;if(!d)return;
    const games=this.window.value==='82'?d.games:d.games.slice(0,Number(this.window.value));
    const hasLine=this.line.value!==''&&this.line.validity.valid;
    const line=Number(this.line.value), side=this.side.value;
    const hits=games.filter(g=>outcome(g.value,line,side)==='Hit').length;
    const pushes=games.filter(g=>outcome(g.value,line,side)==='Push').length;
    const chance=hasLine && d.opponent?estimate(d.games,line,side):null;
    const m=d.model, proj=hasLine&&m?lineChance(m,line,side):null;
    const pct=x=>Math.round(100*x)+'%', one=x=>x.toFixed(1), sign=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(1);
    const breakdown=m?'<div class="result-panel" style="margin:12px 0"><strong>Matchup projection: '+one(m.mean)+' '+escape(d.metric)+'</strong>'+(proj?'<p>'+pct(proj.chance)+' chance of '+escape(side.toLowerCase())+' '+line+(proj.push>0.005?' · '+pct(proj.push)+' push':'')+'</p>':'')+'<table style="width:100%;margin-top:8px;font-size:12px"><tbody><tr><td>Recent rate × recent minutes</td><td style="text-align:right">'+one(m.baseline)+'</td><td class="muted">'+(m.rate*36).toFixed(1)+' per 36 min · '+one(m.minutes)+' min lately</td></tr>'+m.steps.map(x=>'<tr><td>'+escape(x.label)+'</td><td style="text-align:right">'+sign(x.change)+'</td><td class="muted">'+escape(x.detail)+'</td></tr>').join('')+'<tr><td><strong>Projection</strong></td><td style="text-align:right"><strong>'+one(m.mean)+'</strong></td><td class="muted">'+one(m.projectedMinutes)+' projected minutes</td></tr></tbody></table>'+(m.notes||[]).map(n=>'<p class="small-text" style="color:var(--yellow)">'+escape(n)+'</p>').join('')+'<p class="small-text">New and not yet validated: a rule-based projection, not a fitted model. Each adjustment is pulled toward no effect when its sample is small.</p></div>':'';
    const target=side==='At least'?line+'+':side.toLowerCase()+' '+line;
    const avg=games.length?(games.reduce((s,g)=>s+g.value,0)/games.length).toFixed(1):'—';
    this.panel.innerHTML=`<div class="stat-profile"><div style="flex:1;padding:12px 0"><h3>${escape(d.name)}</h3><strong>${escape(d.club)} · ${d.opponent?'vs '+escape(d.opponent):'No scheduled game'}</strong><small>${escape(d.status||d.date)}</small><b style="font-size:clamp(23px,4vw,36px)">${hasLine?(proj?pct(proj.chance)+' projected chance':chance===null?'Estimate unavailable':chance+'% weighted hit rate'):m?one(m.mean)+' projected':avg+' average'} </b>${hasLine&&proj&&chance!==null?'<small>Weighted hit rate: '+chance+'%</small>':''}<small>${hasLine?target+' '+escape(d.metric)+' · '+hits+' of '+games.length+' hits'+(pushes?' · '+pushes+' pushes':''):games.length+' games'} · ${escape(d.metric)}</small></div>${d.photo?'<img style="width:clamp(75px,25%,150px);align-self:end" alt="" src="'+escape(d.photo)+'">':''}</div>${hasLine?'<p class="muted small-text">'+(!d.opponent?'Select a scheduled matchup for an estimate.':chance===null?'At least five completed appearances are needed.':(proj?'If the player appears. The projected chance includes minutes, teammates out, home or away and the opponent (breakdown below). The weighted hit rate is the season record weighted toward recent games, without those adjustments.':'If the player appears. Based on '+d.games.length+' season appearances, weighted toward recent games. This estimate is uncalibrated and excludes injury, minutes and opponent adjustments.'))+'</p>':''}${breakdown}${gameChart(games,hasLine?line:null,side==='At least')}<small>ESPN · Completed regular-season games before ${escape(d.date)}</small>${d.aiAvailable&&hasLine&&games.length?'<p><button class="btn small" data-explain>Explain with AI</button></p><p data-answer aria-live="polite"></p>':''}`;
    const button=this.panel.querySelector('[data-explain]');
    if(button)button.onclick=async()=>{
      const answer=this.panel.querySelector('[data-answer]');button.disabled=true;answer.textContent='Preparing explanation…';
      try{
        const token=await this.getToken();
        const data=await request('/api/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...this.args(),line,side,window:this.window.value})});
        answer.textContent=data.answer;
      }catch(error){answer.textContent=error.message;}finally{button.disabled=false;}
    };
  }
}
customElements.define('nba-player-search',PlayerSearch);

