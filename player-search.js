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
    this.innerHTML=`<section class="card" style="margin-bottom:20px"><div class="card-body"><h2>Find a player</h2><form style="display:flex;gap:8px"><input name="search" class="search" aria-label="Player name" placeholder="Enter a player name" required maxlength="80" style="flex:1;min-width:0"><button class="btn primary">Search</button></form><div data-matches aria-live="polite"></div><div data-card></div></div></section>`;
    this.form=this.querySelector('form');
    this.matches=this.querySelector('[data-matches]');
    this.output=this.querySelector('[data-card]');
    this.form.onsubmit=async e=>{
      e.preventDefault();
      const term=normalize(this.form.elements.search.value);
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
        if(found.length===1||exact.length===1){this.choose(exact[0]||found[0]);return;}
        this.matches.textContent=found.length?'Select a player':'No player found on current NBA rosters.';
        for(const player of found.slice(0,20)){
          const button=document.createElement('button');
          button.className='btn small';button.textContent=player.name+' · '+player.club;
          button.onclick=()=>this.choose(player);this.matches.append(' ',button);
        }
      }catch(error){if(seq===this.version)this.matches.textContent=error.message;}
    };
  }
  choose(player){
    this.version++;this.player=player;
    this.matches.textContent='';this.form.elements.search.value=player.name;
    this.output.innerHTML=`<div class="field-row" style="margin-top:16px;flex-wrap:wrap"><label class="field">Game date<input name="day" type="date"></label><label class="field">Stat<select name="metric"><option value="points">Points</option><option value="rebounds">Rebounds</option><option value="assists">Assists</option><option>PRA</option></select></label><label class="field">Your line<input name="line" type="number" min="0" max="250" step="0.5" placeholder="Enter line"></label><label class="field">Window<select name="window">${[5,10,15,20,82].map(n=>'<option value="'+n+'" '+(n===10?'selected':'')+'>'+(n===82?'Season':'Last '+n)+'</option>').join('')}</select></label></div><div data-panel aria-live="polite"></div>`;
    const field=name=>this.output.querySelector('[name="'+name+'"]');
    this.day=field('day');this.metric=field('metric');this.line=field('line');this.window=field('window');this.panel=this.output.querySelector('[data-panel]');
    this.day.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    this.day.onchange=this.metric.onchange=()=>this.load();
    this.line.oninput=this.window.onchange=()=>this.draw();
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
    const line=Number(this.line.value), over=games.filter(g=>g.value>line).length;
    const avg=games.length?(games.reduce((s,g)=>s+g.value,0)/games.length).toFixed(1):'—';
    this.panel.innerHTML=`<div class="stat-profile"><div style="flex:1;padding:12px 0"><h3>${escape(d.name)}</h3><strong>${escape(d.club)} · ${d.opponent?'vs '+escape(d.opponent):'No scheduled game'}</strong><small>${escape(d.status||d.date)}</small><b style="font-size:clamp(23px,4vw,36px)">${hasLine&&games.length?Math.round(100*over/games.length)+'% over '+line:avg+' average'} </b><small>${hasLine?over+' of '+games.length+' games above your line':games.length+' games'} · ${escape(d.metric)}</small></div>${d.photo?'<img style="width:clamp(75px,25%,150px);align-self:end" alt="" src="'+escape(d.photo)+'">':''}</div><div style="display:flex;gap:5px;overflow-x:auto;padding:8px 0">${[...games].reverse().map(g=>{
      const outcome=!hasLine?'':g.value>line?'Over':g.value<line?'Under':'Push';
      const color={Over:'#4ade80',Under:'#fb6577',Push:'#c3ccda','':'#a7d8e9'}[outcome];
      return `<div style="min-width:58px;padding:7px;text-align:center;background:#192b40;border-radius:8px;border-bottom:3px solid ${color}"><small>${escape(g.date.slice(5))}</small><br><b style="color:${color};font-size:20px">${g.value}</b><br><small>${escape(g.opponent)} ${outcome}</small></div>`;
    }).join('')}</div><small>ESPN · Completed regular-season games before ${escape(d.date)}</small>${d.aiAvailable&&hasLine&&games.length?'<p><button class="btn small" data-explain>Explain with AI</button></p><p data-answer aria-live="polite"></p>':''}`;
    const button=this.panel.querySelector('[data-explain]');
    if(button)button.onclick=async()=>{
      const answer=this.panel.querySelector('[data-answer]');button.disabled=true;answer.textContent='Preparing explanation…';
      try{
        const token=await this.getToken();
        const data=await request('/api/ask',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...this.args(),line,window:this.window.value})});
        answer.textContent=data.answer;
      }catch(error){answer.textContent=error.message;}finally{button.disabled=false;}
    };
  }
}
customElements.define('nba-player-search',PlayerSearch);
