const dayET = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selection = {date:'',game:'',team:'',player:''};
const option = (value,label) => '<option value="'+safe(value)+'">'+safe(label)+'</option>';
const table = (headers,rows) => '<div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr>'+headers.map(h=>'<th>'+safe(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+safe(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
async function get(params,signal) {
  const response = await fetch('/api/stats?'+new URLSearchParams(params),{signal});
  if (!response.ok) throw new Error('Game data is unavailable. Try Refresh.');
  return response.json();
}
function renderTrend(host, rows, opponent, settings) {
  host.innerHTML='<h3>Game-by-game trend</h3><div class="field-row"><label class="field">Stat<select name="metric">'+['Points','Rebounds','Assists','Points + rebounds + assists'].map((v,i)=>option(i,v)).join('')+'</select></label><label class="field">Games<select name="window">'+[5,10,15,20,'Season','Opponent'].map(v=>option(v,v)).join('')+'</select></label><label class="field">Your prop line<input name="line" type="number" min="0" step="0.5" placeholder="Enter line"></label></div><div data-chart></div>';
  const metric=host.querySelector('[name=metric]'), period=host.querySelector('[name=window]'), line=host.querySelector('[name=line]');
  metric.value=settings.metric;period.value=settings.period;line.value=settings.line;
  function draw(){
    Object.assign(settings,{metric:metric.value,period:period.value,line:line.value});
    const subset=period.value==='Opponent'?rows.filter(r=>r.opponentId===opponent.id):period.value==='Season'?rows:rows.slice(0,Number(period.value));
    const mark=line.value!=='' && line.validity.valid?Number(line.value):null;
    const vals=subset.map(r=>metric.value==='3'?r.values.reduce((a,b)=>a+b,0):r.values[Number(metric.value)]);
    const scale=Math.max(1,...vals,mark||0);
    const over=vals.filter(v=>v>mark).length,under=vals.filter(v=>v<mark).length;
    const stat=metric.selectedOptions[0].textContent;
    const pct=n=>Math.round(n*100/vals.length)+'%';
    const summary=mark===null?'Enter a prop line to see historical hit rates.':'Over '+mark+': '+over+'/'+vals.length+' ('+pct(over)+') · Under: '+under+'/'+vals.length+' ('+pct(under)+') · Push: '+(vals.length-over-under);
    const bars=subset.map((r,i)=>{
      const val = vals[i];
      const outcome = mark === null ? 'neutral' : val > mark ? 'over' : val < mark ? 'under' : 'push';
      return `<div class="trend-row" data-outcome="${outcome}">
        <small>${safe(r.date.slice(5)+' '+r.venue+' '+r.opponent)}</small>
        <div class="trend-track"><span style="width:${val/scale*100}%"></span>${mark===null?'':`<i style="left:${mark/scale*100}%"></i>`}</div>
        <b>${val}</b><small class="trend-outcome">${mark===null?'':outcome}</small>
      </div>`;
    }).join('');
    host.querySelector('[data-chart]').innerHTML=subset.length?'<p>'+safe(stat)+' · '+safe(summary)+'</p><div style="max-height:320px;overflow:auto">'+bars+'</div>':'<p>No qualifying games in this window.</p>';
  }
  host.oninput=draw;draw();
}

class PlayerStats extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<section class="card"><div class="card-header"><div><h2>NBA player stats &amp; matchups</h2><div class="card-subtitle">Daily schedule · Eastern time</div></div><button class="btn small" type="button">Refresh</button></div><div class="card-body"><div class="field-row"><label class="field">Game date<input type="date" data-key="date"></label><label class="field">Matchup<select data-key="game"></select></label></div><div class="field-row"><label class="field">Team<select data-key="team"></select></label><label class="field">Player<select data-key="player"></select></label></div><div data-result aria-live="polite"></div></div></section>';
    this.field('date').value = selection.date || dayET();
    this.chartSettings = {metric:'0',period:'10',line:''};
    this.onchange = e => {
      const key=e.target.dataset.key;
      if(!key) return;
      selection[key]=e.target.value;
      this.chartSettings.line='';
      this.load(key);
    };
    this.querySelector('button').onclick=()=>this.load('date');
    this.load('date');
    this.timer=setInterval(()=>{
      if(document.hidden || this.busy || this.contains(document.activeElement)) return;
      if(!selection.date) this.field('date').value=dayET();
      this.load('date',true);
    },60000);
  }
  disconnectedCallback(){clearInterval(this.timer);this.controller?.abort();}
  field(key){return this.querySelector('[data-key="'+key+'"]');}
  choices(key,items) {
    const select=this.field(key);
    select.innerHTML=items.map(item=>option(item.id,item.name)).join('');
    if(items.some(item=>item.id===selection[key])) select.value=selection[key];
    selection[key]=select.value;
    select.disabled=!items.length;
  }
  async load(key,quiet=false) {
    this.controller?.abort();
    const controller=new AbortController();
    this.controller=controller;
    this.busy=true;
    const result=this.querySelector('[data-result]');
    const date=this.field('date').value;
    try {
      if(!quiet){
        result.textContent='Loading game data…';
        const keys=['date','game','team','player'];
        for(const k of keys.slice(keys.indexOf(key)+1)){this.field(k).innerHTML='';this.field(k).disabled=true;}
      }
      if(!date){result.textContent='Choose a game date.';return;}
      if(key==='date'){
        this.games=(await get({date},controller.signal)).data;
        this.choices('game',this.games);
      }
      const game=this.games?.find(g=>g.id===this.field('game').value);
      if(!game){result.textContent='No NBA games on the schedule for this date.';return;}
      if(key==='date'||key==='game') this.choices('team',game.teams);
      const team=this.field('team').value;
      if(key!=='player'){
        const roster=await get({team,season:game.season},controller.signal);
        this.choices('player',roster.data);
      }
      const player=this.field('player').value;
      if(!player){result.textContent='No roster available for this team.';return;}
      const log=await get({player,season:game.season},controller.signal);
      const rows=log.data.filter(r=>r.date<date);
      const opponent=game.teams.find(t=>t.id!==team);
      const vs=rows.filter(r=>r.opponentId===opponent.id);
      const summary=(label,list)=>[label,list.length,...[0,1,2].map(i=>list.length?(list.reduce((s,r)=>s+r.values[i],0)/list.length).toFixed(1):'—')];
      const windows=[5,10,15,20].map(n=>summary('Last '+n,rows.slice(0,n)));
      windows.push(summary('Season to date',rows),summary('vs '+opponent.abbr,vs));
      const gameTable=list=>table(['Date','Opponent','PTS','REB','AST'],list.map(r=>[r.date,r.venue+' '+r.opponent,...r.values]));
      const checked=new Date(log.updated).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
      const name = this.field('player').selectedOptions[0].textContent;
      const initials = name.split(/\s+/).map(word=>word[0]).slice(0,2).join('');
      const header = `<header class="stat-profile"><div class="stat-portrait"><span aria-hidden="true">${safe(initials)}</span></div>
        <div><h3>${safe(name)}</h3><strong>vs ${safe(opponent.name)}</strong><small>${safe(game.status)}</small></div></header>`;
      result.innerHTML=header+'<p class="muted">Regular-season appearances before '+safe(date)+'</p>'+table(['Per-game averages','Games','PTS','REB','AST'],windows)+'<section data-trend></section><details><summary>Games against '+safe(opponent.abbr)+' ('+vs.length+')</summary>'+(vs.length?gameTable(vs):'<p>No prior meeting played this season.</p>')+'</details><details><summary>Season game log ('+rows.length+')</summary>'+gameTable(rows)+'</details><p class="muted small-text">ESPN game logs · Checked '+safe(checked)+' ET</p>';
      const portrait = new Image();
      portrait.alt = name;
      portrait.onload = () => portrait.parentElement?.classList.add('loaded');
      portrait.onerror = () => portrait.remove();
      result.querySelector('.stat-portrait').append(portrait);
      portrait.src = 'https://a.espncdn.com/i/headshots/nba/players/full/' + encodeURIComponent(player) + '.png';
      renderTrend(result.querySelector('[data-trend]'),rows,opponent,this.chartSettings);
    } catch(err) {
      if(!controller.signal.aborted) result.textContent='Game data is unavailable. Try Refresh.';
    } finally {if(this.controller===controller)this.busy=false;}
  }
}
customElements.define('nba-player-stats',PlayerStats);
