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
class PlayerStats extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<section class="card"><div class="card-header"><div><h2>NBA player stats &amp; matchups</h2><div class="card-subtitle">Daily schedule · Eastern time</div></div><button class="btn small" type="button">Refresh</button></div><div class="card-body"><div class="field-row"><label class="field">Game date<input type="date" data-key="date"></label><label class="field">Matchup<select data-key="game"></select></label></div><div class="field-row"><label class="field">Team<select data-key="team"></select></label><label class="field">Player<select data-key="player"></select></label></div><div data-result aria-live="polite"></div></div></section>';
    this.field('date').value = selection.date || dayET();
    this.onchange = e => {
      const key=e.target.dataset.key;
      if(!key) return;
      selection[key]=e.target.value;
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
      result.innerHTML='<h3>'+safe(this.field('player').selectedOptions[0].textContent)+' vs '+safe(opponent.name)+'</h3><p class="muted">'+safe(game.status)+' · Regular-season appearances before '+safe(date)+'</p>'+table(['Per-game averages','Games','PTS','REB','AST'],windows)+'<details><summary>Games against '+safe(opponent.abbr)+' ('+vs.length+')</summary>'+(vs.length?gameTable(vs):'<p>No prior meeting played this season.</p>')+'</details><details><summary>Season game log ('+rows.length+')</summary>'+gameTable(rows)+'</details><p class="muted small-text">ESPN game logs · Checked '+safe(checked)+' ET</p>';
    } catch(err) {
      if(!controller.signal.aborted) result.textContent='Game data is unavailable. Try Refresh.';
    } finally {if(this.controller===controller)this.busy=false;}
  }
}
customElements.define('nba-player-stats',PlayerStats);
