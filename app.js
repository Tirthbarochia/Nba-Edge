import {research, games, SNAPSHOT_DATE} from './research.js';

const CONFIG = window.NBA_EDGE_CONFIG || {};
const HAS_BACKEND = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_PUBLISHABLE_KEY);
const DEMO_KEYS = {predictions:'nba-edge-demo-predictions-v1',entries:'nba-edge-demo-entries-v1'};
const state = {
  view:'dashboard',filter:'ALL',query:'',selectedProp:'davion-pra',ticket:[],
  authMode:'signup',client:null,user:null,backendReady:false,loading:false,
  predictions:[],entries:[],customAnalysis:null,quote:{stake:'',gross:''},
  manualAnalysis:null, marketSource:'kalshi', kalshiSeries:'KXNBAPTS', kalshiDate:todayNY(), kalshiRows:[], kalshiFetched:null, kalshiError:'', kalshiLoading:false, oddsEvents:[], oddsRows:[], oddsFetched:null, oddsError:'', oddsLoading:false, oddsEvent:'', oddsMarket:'player_points', liveTicker:'', liveInfo:null, liveError:'', liveLoading:false
};
const $ = sel => document.querySelector(sel);
function todayNY(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfmt = (num,dp=0) => Number(num).toLocaleString('en-US',{maximumFractionDigits:dp,minimumFractionDigits:dp});
const today = () => { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const id = () => globalThis.crypto?.randomUUID?.() || `tmp-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
const initials = name => name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const percent = (hits,n) => n ? `${Math.round(100*hits/n)}%`:'—';
const money = val => Number.isFinite(Number(val)) && val!==null && val!=='' ? '$'+Number(val).toFixed(2) : '—';
const resultLabel = s => ({win:'HIT',loss:'MISS',pending:'PENDING',push:'PUSH',void:'VOID'}[s]||'PENDING');
const pill = (s,cls='')=>`<span class="pill ${cls}">${esc(s)}</span>`;
const sampleNotice = () => `<div class="snapshot-banner"><span class="snapshot-icon">!</span><div><strong>ARCHIVED RESEARCH · NOV 13, 2026</strong><br><span>This is a research snapshot, not live NBA data or verified DraftKings Pick6 projections. Check tonight's actual board before entering a paid ticket.</span></div></div>`;
const userName = () => state.user?.email?.split('@')[0] || 'Guest';
function toast(msg, type='') {const div=document.createElement('div');div.className=`toast ${type}`;div.textContent=msg;$('#toastArea').append(div);setTimeout(()=>div.remove(),5000);}
function localRead(key){try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}}
function localWrite(key,data){try{localStorage.setItem(key,JSON.stringify(data))}catch{toast('Browser storage unavailable. Your changes may not persist.','error')}}
function uid(){return state.user?.id||null}
function pageHeader(kicker,title,desc,buttons=''){return `<div class="head-row"><div><div class="eyebrow">${kicker}</div><h1 class="page-title">${title}</h1><p class="page-desc">${desc}</p></div><div class="action-row">${buttons}</div></div>`}
function kpi(label,value,foot,icon='↗'){return `<div class="kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`}
function playerCell(p){return `<div class="player-cell"><div class="player-avatar">${esc(initials(p.player))}</div><div style="min-width:0"><div class="player-name">${esc(p.player)}</div><div class="player-meta">${esc(p.team||'')}${p.matchup?' · '+esc(p.matchup):''}</div></div></div>`}
function ratingPill(r){return pill(r,r==='Candidate'?'lime':r==='Pass'?'red':r==='Conditional'?'amber':'')}
function trend(p){const pct=p.hits/p.n*100;return `<div class="hit-main">${p.hits}/${p.n} <span class="muted small-text">(${percent(p.hits,p.n)})</span></div><div class="hit-progress ${p.hits<7?'warn':''}"><i style="width:${pct}%"></i></div>`}
function score(){const settled=state.predictions.filter(x=>['win','loss'].includes(x.result));const wins=settled.filter(x=>x.result==='win').length;const pending=state.predictions.filter(x=>x.result==='pending').length;return {settled: settled.length,wins,pending,rate:settled.length?percent(wins,settled.length):'—'}}
function sampleRow(p){return `<div class="research-row">${playerCell(p)}<div class="market-col"><strong class="small-text">${esc(p.threshold)}</strong><div class="muted" style="font-size:10px">Unverified board</div></div><div>${trend(p)}</div><button class="btn small ghost" data-action="open-prop" data-id="${esc(p.id)}">Analyze →</button></div>`}
function renderDashboard(){const s=score();const last=state.predictions.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,4); const top=research.filter(p=>p.rating==='Candidate').slice(0,5);
return `<div class="page">${pageHeader('THE COMMAND CENTER','Your edge starts with the data.','A focused workspace for researching NBA props, comparing Pick6 projections and tracking every forecast.',`<button class="btn ghost" data-view="tracking">View tracker</button><button class="btn primary" data-view="builder">+ Build a Pick6 entry</button>`)}${sampleNotice()}
<div class="kpi-grid">${kpi('Saved predictions',nfmt(state.predictions.length),'Personal research log','◈')}${kpi('Settled hit rate',esc(s.rate),`${s.settled} graded predictions`,'◎')}${kpi('Pending forecasts',nfmt(s.pending),'Not counted as wins','◷')}${kpi('Draft entries',nfmt(state.entries.filter(e=>e.status==='draft').length),'Not counted as wagers','▤')}</div>
<div class="grid-main"><div><div class="card"><div class="card-header"><div><h2>November 13 research slate</h2><div class="card-subtitle">9 archived matchups · tipoffs shown in ET</div></div>${pill('NOV 13 · ARCHIVE','amber')}</div><div class="card-body"><div class="matchups">${games.map(g=>`<div class="matchup"><div class="match-top"><span>NBA</span><span>◉</span></div><div class="match-teams">${g[0]} <em>@</em> ${g[1]}</div><div class="match-time">${g[2]}</div></div>`).join('')}</div></div></div><div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Research watchlist</h2><div class="card-subtitle">Historical hit rates at user-specified thresholds</div></div><button data-view="analyzer" class="text-link">Open analyzer →</button></div>${top.map(sampleRow).join('')}</div></div>
<div><div class="card"><div class="card-header"><div><h2>Model guardrails</h2><div class="card-subtitle">Built into every proposed ticket</div></div></div><div class="card-body"><div class="insight-stack"><div class="insight"><div class="insight-tag">01 · VERIFY</div><strong>Confirm exact Pick6 lines</strong><p>Never replace a 1.5 three-point projection with a 2.5 line without re-running the research.</p></div><div class="insight"><div class="insight-tag">02 · EVALUATE</div><strong>Look beyond last 10 hits</strong><p>Minutes, usage, injuries and game context matter. A 9/10 trend is not a 90% forecast.</p></div><div class="insight"><div class="insight-tag">03 · TRACK</div><strong>Log misses, not only wins</strong><p>Track pending picks and drafts separately from settled results and actual placed tickets.</p></div></div><div class="legend-note">No live feed is connected. The model does not assert any verified positive edge.</div></div></div>
<div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Your recent forecasts</h2><div class="card-subtitle">Private to your current account or device</div></div><button class="text-link" data-view="tracking">See all →</button></div>${last.length?last.map(x=>`<div class="research-row">${playerCell(x)}<div class="market-col">${esc(x.side)} ${esc(x.line)} ${esc(x.market)}</div><div>${pill(resultLabel(x.result),x.result==='win'?'lime':x.result==='loss'?'red':'amber')}</div><div></div></div>`).join(''):`<div class="empty"><div class="empty-icon">◷</div><strong>No predictions logged yet</strong><p>Use the Pick6 builder or add a manual forecast to start a transparent track record.</p><button data-view="tracking" class="btn small">Log a forecast</button></div>`}</div></div></div>
<div class="foot-note">NBA EDGE · Research platform prototype · No official affiliation with the NBA, DraftKings or Kalshi.</div></div>`;
}
function renderAnalyzer(){return `<div class="page">${pageHeader('PLAYER PROP INTELLIGENCE','Research before you select.','Inspect historical thresholds and run a descriptive check on any player using actual recent stat totals.',`<button class="btn primary" data-view="builder">Open Pick6 builder →</button>`)}${sampleNotice()}
<div class="toolbar"><input id="propSearch" class="search" placeholder="⌕  Search player, team or matchup…" value="${esc(state.query)}" aria-label="Search research props"/><div class="filter-row" id="marketFilters">${['ALL','PTS','REB','AST','PRA','P+R','3PM'].map(f=>`<button data-action="filter" data-filter="${f}" class="filter-pill ${state.filter===f?'active':''}">${f}</button>`).join('')}</div></div>
<div class="analysis-grid"><div><div class="card"><div class="card-header"><div><h2>Research library</h2><div class="card-subtitle">From your 13-prop research list · not the live Pick6 board</div></div><span class="pill">${research.length} props</span></div><div id="researchList"></div></div><div><div class="card" id="propDetail"></div><div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Custom stat checker</h2><div class="card-subtitle">Enter real results, comma-separated</div></div><div class="card-body"><form id="customAnalysisForm"><div class="field"><label for="caPlayer">Player</label><input id="caPlayer" name="player" placeholder="e.g. Jalen Johnson" required maxlength="100"/></div><div class="field-row"><div class="field"><label for="caMarket">Stat category</label><select id="caMarket" name="market">${['PTS','REB','AST','3PM','PRA','P+R','R+A'].map(m=>`<option>${m}</option>`).join('')}</select></div><div class="field"><label for="caLine">Pick6 projection</label><input id="caLine" name="line" type="number" min="0" step="0.5" placeholder="22.5" required/></div></div><div class="field"><label for="caSide">Selection</label><select id="caSide" name="side"><option value="MORE">MORE</option><option value="LESS">LESS</option></select></div><div class="field"><label for="caValues">Recent actual stat totals (oldest to newest)</label><textarea id="caValues" name="values" placeholder="18, 24, 19, 28, 21, 17, 26, 23, 20, 25" required></textarea></div><button class="btn primary" type="submit" style="width:100%">Calculate historical trend</button></form><div id="customAnalysisResult">${renderCustomAnalysisResult()}</div></div></div></div></div></div>`}
function renderResearchList(){const parent=$('#researchList');if(!parent)return;const q=state.query.toLowerCase().trim();const matches=research.filter(p=>(state.filter==='ALL'||p.market===state.filter)&&(`${p.player} ${p.team} ${p.matchup} ${p.market}`.toLowerCase().includes(q)));parent.innerHTML=matches.length?matches.map(sampleRow).join(''):`<div class="empty">No matching research props. Try a different player or stat filter.</div>`}
function renderPropDetail(){const p=research.find(x=>x.id===state.selectedProp)||research[0];const el=$('#propDetail');if(!el)return;el.innerHTML=`<div class="card-body"><div class="detail-head"><div class="detail-top"><div class="player-avatar" style="height:48px;width:48px;font-size:14px">${esc(initials(p.player))}</div><div><h3>${esc(p.player)}</h3><div class="muted small-text">${esc(p.team)} · ${esc(p.matchup)}</div></div></div>${ratingPill(p.rating)}</div><div class="muted small-text">HISTORICAL CLEAR RATE</div><div class="big-hit">${percent(p.hits,p.n)} <small>${p.hits} / ${p.n} games</small></div><div class="big-meter"><span style="width:${p.hits/p.n*100}%"></span></div><div class="fact-grid"><div class="fact"><small>Researched threshold</small><strong>${esc(p.threshold)}</strong></div><div class="fact"><small>Equivalent MORE line</small><strong>${p.line}</strong></div><div class="fact"><small>Stat category</small><strong>${esc(p.market)}</strong></div><div class="fact"><small>Pick6 availability</small><strong style="color:#e5c87e">Unverified</strong></div></div><div class="note-card"><strong>Key risk:</strong> ${esc(p.risk)}</div><p class="notice">${esc(p.notes)}</p><p class="notice">Historical hits do not establish a calibrated probability, payout advantage, or future result.</p><button class="btn primary" style="width:100%;margin-top:10px" data-action="add-prop" data-id="${esc(p.id)}">+ Add MORE ${p.line} to draft</button></div>`;}
function renderCustomAnalysisResult(){const r=state.customAnalysis;if(!r)return '';return `<div class="result-panel"><strong>${esc(r.player)} · ${esc(r.side)} ${r.line} ${esc(r.market)}</strong><div style="display:flex;gap:17px;flex-wrap:wrap;margin-top:13px"><div><div class="big-hit" style="font-size:29px">${r.hits}/${r.n}</div><span class="muted small-text">Historical clears</span></div><div><div class="big-hit" style="font-size:29px">${nfmt(r.avg,1)}</div><span class="muted small-text">Observed average</span></div><div><div class="big-hit" style="font-size:29px">${nfmt(r.median,1)}</div><span class="muted small-text">Median</span></div></div><p>These are descriptive sample statistics only. Results are not automatically an estimated probability or a recommendation.</p><button class="btn small" style="margin-top:11px" data-action="add-custom">+ Add to builder</button></div>`}

function addTicketLeg(leg) {
  if(state.ticket.length>=6){toast('Maximum six selections in this builder.','error');return;}
  const key = `${leg.player}|${leg.market}`;
  if(state.ticket.some(x=>`${x.player}|${x.market}`===key)){toast('One selection per player/stat market; remove the existing one first.','error');return;}
  state.ticket.push({id:id(),player:String(leg.player).slice(0,100),team:leg.team||'',matchup:leg.matchup||'',market:leg.market,side:leg.side,line:Number(leg.line),source:leg.source||'manual',verified:false});
  toast('Added to your draft. Confirm the current Pick6 projection.','success');render();
}
function renderBuilder(){const names=research.slice(0,12);const warnings=[];
  if(state.ticket.length>0&&state.ticket.length<2)warnings.push('Pick6 entries need multiple selections. Save this as a draft until you have enough legs.');
  if(state.ticket.length>1&&new Set(state.ticket.map(x=>x.team||x.player)).size===1)warnings.push('Every player is from one team. Pick6 commonly requires players from multiple teams; verify current rules.');
  if(state.ticket.some(x=>x.source!=='live'))warnings.push('Every line on this ticket is manually entered or from archived research—not verified on the current Pick6 board.');
  const dupPlayers=state.ticket.map(x=>x.player).filter((v,i,a)=>a.indexOf(v)!==i);if(dupPlayers.length)warnings.push('Same-player picks have correlated outcomes: '+[...new Set(dupPlayers)].map(esc).join(', '));
  const matchupCounts={};state.ticket.forEach(x=>{if(x.matchup)matchupCounts[x.matchup]=(matchupCounts[x.matchup]||0)+1});if(Object.values(matchupCounts).some(x=>x>1))warnings.push('Some legs share a game. Consider matchup/tempo/injury correlation rather than multiplying independent hit rates.');
  return `<div class="page">${pageHeader('PICK6 ENTRY WORKSPACE','Build deliberately. Not bigger.','Select a line, check its research, then save a draft. This does not place a wager.',`<button class="btn ghost" data-action="clear-ticket">Clear builder</button>`)}${sampleNotice()}
  <div class="ticket-grid"><div><div class="card"><div class="card-header"><div><h2>Research candidates</h2><div class="card-subtitle">Select MORE or LESS · lines must be checked manually</div></div>${pill('13 RESEARCH PROPS','amber')}</div><div class="choice-grid">${names.map(p=>`<div class="choice"><strong>${esc(p.player)}</strong><small>${esc(p.team)} · ${esc(p.matchup)}</small><div class="choice-market">${esc(p.market)} ${p.line}</div><small>Threshold: ${esc(p.threshold)} · ${p.hits}/${p.n} historical MORE hits</small><div class="choice-buttons"><button class="btn small primary" data-action="pick-side" data-id="${esc(p.id)}" data-side="MORE">MORE</button><button class="btn small ghost" data-action="pick-side" data-id="${esc(p.id)}" data-side="LESS">LESS</button></div></div>`).join('')}</div></div><div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Add any Pick6 projection</h2><div class="card-subtitle">Copy the current line from the Pick6 app</div></div></div><div class="card-body"><form id="manualLegForm"><div class="field-row"><div class="field"><label>Player</label><input name="player" maxlength="100" placeholder="Player name" required/></div><div class="field"><label>Team</label><input name="team" maxlength="12" placeholder="e.g. BOS"/></div></div><div class="field-row"><div class="field"><label>Market</label><select name="market">${['PTS','REB','AST','3PM','PRA','P+R','R+A','STL','BLK'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Projection</label><input name="line" type="number" min="0" step="0.5" placeholder="22.5" required/></div></div><div class="field"><label>Side</label><select name="side"><option>MORE</option><option>LESS</option></select></div><button type="submit" class="btn primary">+ Add manually</button></form></div></div></div>
  <div><div class="card"><div class="card-header"><div><h2>My draft ticket</h2><div class="card-subtitle">${state.ticket.length} / 6 selections</div></div>${pill('NOT PLACED','amber')}</div><div class="card-body">${state.ticket.length?state.ticket.map(x=>`<div class="ticket-leg"><div><strong>${esc(x.player)} · ${esc(x.side)} ${x.line} ${esc(x.market)}</strong><small>${esc(x.team||'Team not set')} · Unverified line</small></div><button class="remove-btn" data-action="remove-leg" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.player)}">×</button></div>`).join(''):'<div class="empty"><div class="empty-icon">▤</div><strong>Your entry is empty</strong><p>Add two or more player props to begin.</p></div>'}
  ${warnings.length?`<ul class="warning-list">${warnings.map(x=>`<li>⚠ ${x}</li>`).join('')}</ul>`:''}
  <div class="divider"></div><form id="quoteForm"><div class="muted small-text" style="margin-bottom:10px">OPTIONAL QUOTE CHECK (ENTER ACTUAL PICK6 AMOUNTS)</div><div class="field-row"><div class="field"><label>Entry cost ($)</label><input type="number" min="0" step="0.01" name="stake" value="${esc(state.quote.stake)}" placeholder="10"/></div><div class="field"><label>Gross return if correct ($)</label><input type="number" min="0" step="0.01" name="gross" value="${esc(state.quote.gross)}" placeholder="35"/></div></div><button type="submit" class="btn ghost small" style="width:100%">Check payout math</button></form>${quoteResult()}
  <div class="divider"></div><button class="btn primary" style="width:100%" data-action="save-entry" ${state.ticket.length?'':'disabled'}>Save draft entry</button><button class="btn ghost" style="width:100%;margin-top:10px" data-action="track-ticket" ${state.ticket.length?'':'disabled'}>Log legs as pending forecasts</button><p class="notice">Saving a draft or logging a forecast does not mean a wager was placed. We do not submit bets.</p></div></div>
  <div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Saved entries</h2><div class="card-subtitle">Your personal drafts and research records</div></div></div>${state.entries.length?state.entries.slice().reverse().slice(0,6).map(x=>`<div class="ticket-leg" style="padding:14px 18px"><div><strong>${(x.legs||[]).length} legs · ${esc(x.status||'draft').toUpperCase()}</strong><small>${esc((x.created_at||'').slice(0,10))} · ${(x.legs||[]).map(v=>esc(v.player)).join(', ')}</small></div><button data-action="delete-entry" data-id="${esc(x.id)}" class="btn small ghost">Delete</button></div>`).join(''):'<div class="empty">No saved entries yet.</div>'}</div></div></div></div>`;
}
function quoteResult(){const stake=Number(state.quote.stake),gross=Number(state.quote.gross);if(!(stake>0)||!(gross>0))return '<p class="notice">No price quote entered yet. Historical hit rates are not calibrated win probabilities.</p>';if(gross<=stake)return '<p class="notice" style="color:#f1b59a">Gross return must be greater than entry cost to show positive profit.</p>';const be=100*stake/gross;return `<div class="result-panel"><div class="price-metric">Potential net profit <strong>${money(gross-stake)}</strong></div><div class="price-metric">Break-even combined hit rate <strong>${be.toFixed(1)}%</strong></div><p>Arithmetic only, ignoring fees, promotions and payout adjustments. Not an estimated success probability.</p></div>`}
function renderTracking(){const s=score();return `<div class="page">${pageHeader('PERFORMANCE LAB','Track every call.','Log picks before games, then grade hits, misses and pushes separately. These are your own records.',`<button class="btn ghost" data-action="export-csv">Export CSV ↓</button>`)}<div class="kpi-grid">${kpi('Total forecasts',state.predictions.length,'Including pending','▤')}${kpi('Settled',s.settled,'HIT or MISS only','◎')}${kpi('Historical hit rate',s.rate,'No adjustment for odds','↗')}${kpi('Pending',s.pending,'Not counted as wins','◷')}</div>
<div class="card"><div class="card-header"><div><h2>Log a forecast</h2><div class="card-subtitle">Save before the game starts to preserve prediction integrity</div></div></div><div class="card-body"><form id="forecastForm"><div class="field-row"><div class="field"><label>Player</label><input name="player" required maxlength="100" placeholder="Player name" /></div><div class="field"><label>Team</label><input name="team" maxlength="12" placeholder="e.g. NYK" /></div></div><div class="field-row"><div class="field"><label>Market</label><select name="market">${['PTS','REB','AST','3PM','PRA','P+R','R+A','STL','BLK'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field"><label>Projection</label><input name="line" type="number" min="0" step="0.5" required placeholder="20.5"/></div></div><div class="field-row"><div class="field"><label>Side</label><select name="side"><option>MORE</option><option>LESS</option></select></div><div class="field"><label>Game date</label><input type="date" name="game_date" value="${today()}" required/></div></div><div class="field"><label>Notes / reason</label><textarea name="note" maxlength="500" placeholder="Minutes, matchup, injuries, line source and why you selected it"></textarea></div><button class="btn primary" type="submit">Save pending forecast</button></form></div></div>
<div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Prediction history</h2><div class="card-subtitle">All statuses and changes are personal to your account</div></div><div class="tracker-table"><table><thead><tr><th>Date</th><th>Player</th><th>Selection</th><th>Status</th><th>Grade / actions</th></tr></thead><tbody>${state.predictions.length?state.predictions.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).map(x=>`<tr><td>${esc(x.game_date||'—')}</td><td><strong>${esc(x.player)}</strong><br><span class="muted">${esc(x.team||'')}</span></td><td>${esc(x.side)} ${esc(x.line)} ${esc(x.market)}</td><td><span class="status-chip ${esc(x.result)}">${resultLabel(x.result)}</span></td><td><div class="inline-actions"><select class="mini-select" data-change="grade" data-id="${esc(x.id)}" aria-label="Grade forecast">${['pending','win','loss','push','void'].map(v=>`<option value="${v}" ${x.result===v?'selected':''}>${resultLabel(v)}</option>`).join('')}</select><button class="btn small ghost" data-action="delete-forecast" data-id="${esc(x.id)}">Delete</button></div></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty"><strong>No forecasts yet</strong><p>Add your first prediction before tonight’s game.</p></div></td></tr>'}</tbody></table></div></div><div class="foot-note">To audit a model properly, keep all forecasts, including misses, and note any grading corrections. This tracker is not a verified third-party record.</div></div>`}
function renderAccount(){return `<div class="page">${pageHeader('ACCOUNT & ACCESS',state.user?'Your NBA Edge account.':'Join NBA Edge.','Create a free research account to save your predictions across devices.')}<div class="auth-layout"><div class="card"><div class="card-header"><div><h2>${state.user?'Connected account':HAS_BACKEND?'Sign in or create an account':'Demo mode is available'}</h2><div class="card-subtitle">${HAS_BACKEND?'Supabase Auth · Email and password':'Configure Supabase to activate public registration'}</div></div></div><div class="card-body">${state.user?`<p>Signed in as <strong>${esc(state.user.email)}</strong></p><p class="notice">Your forecasts are kept private using per-user database access policies.</p><button class="btn ghost" data-action="logout" style="margin-top:16px">Sign out</button>`:HAS_BACKEND?`<div class="auth-switch"><button class="${state.authMode==='signup'?'active':''}" data-action="switch-auth" data-mode="signup">Create account</button><button class="${state.authMode==='signin'?'active':''}" data-action="switch-auth" data-mode="signin">Sign in</button></div><form id="authForm"><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required/></div><div class="field"><label>Password (8+ characters)</label><input name="password" type="password" minlength="8" autocomplete="${state.authMode==='signup'?'new-password':'current-password'}" required/></div><button class="btn primary" style="width:100%" type="submit">${state.authMode==='signup'?'Create account':'Sign in'}</button></form><p class="notice">If email confirmation is enabled, follow the verification link from Supabase before signing in.</p>`:`<div class="empty"><div class="empty-icon">♙</div><strong>Public registration needs a database</strong><p>Try the rest of the site now. For shared accounts, create a Supabase project, run the included SQL schema, and add the publishable configuration to config.js.</p></div>`}</div></div>
<div class="card"><div class="card-header"><div><h2>What your account includes</h2></div></div><div class="card-body"><div class="account-benefit"><strong>Personal prop library</strong><p>Research statistics and manually check the actual Pick6 projection before choosing a side.</p></div><div class="account-benefit"><strong>Draft builder</strong><p>Save candidate tickets without claiming a wager was placed.</p></div><div class="account-benefit"><strong>Private prediction history</strong><p>Track misses, wins, pushes and voids with correct hit-rate denominators.</p></div><div class="account-benefit"><strong>Data integrity first</strong><p>Unverified lines are flagged, and backtested historical frequencies are not presented as live forecasts.</p></div></div></div></div></div>`}
function render(){const views={dashboard:renderDashboard,analyzer:renderAnalyzer,odds:renderOdds,builder:renderBuilder,tracking:renderTracking,account:renderAccount,live:renderLive};$('#mainContent').innerHTML=(views[state.view]||renderDashboard)();document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===state.view));$('#navCount').textContent=state.ticket.length;$('#topCrumb').textContent=({dashboard:'OVERVIEW',analyzer:'PROP ANALYZER',odds:'MARKET SCANNER',live:'LIVE GAME DATA',builder:'PICK6 BUILDER',tracking:'TRACKER',account:'MY ACCOUNT'}[state.view]||'OVERVIEW');$('#topAccountButton').textContent=state.user?userName():'Guest demo';$('#topAvatar').textContent=state.user?initials(userName()):'G';$('#connectionName').textContent=state.user?'Account connected':HAS_BACKEND?'Registration enabled':'Research demo';$('#connectionSub').textContent=state.user?'Private data syncing':HAS_BACKEND?'Sign in to save across devices':'Kalshi public market data';if(state.view==='analyzer'){renderResearchList();renderPropDetail()}}
function navigate(view){state.view=view;$('#sidebar').classList.remove('open');render();window.scrollTo({top:0,behavior:'auto'});}

// LIVE MARKET DATA -----------------------------------------------------------
function renderOdds() {
  const kalshiOn = state.marketSource === 'kalshi';
  const rows = state.kalshiRows.slice(0, 80);
  const odds = state.oddsRows.slice(0, 110);
  return `<div class="page">${pageHeader('PUBLIC MARKET INTELLIGENCE','Scan markets. Verify the price.','Kalshi public markets and optional sportsbook comparisons from The Odds API. Nothing here is a verified DraftKings Pick6 projection.',`<button class="btn ghost" data-view="live">Live game data →</button>`)}
    <div class="snapshot-banner"><span class="snapshot-icon">!</span><div><strong>MARKET PRICES ARE SNAPSHOTS</strong><br><span>Confirm the currently offered line, ask price, payout and fees on the original platform. A cheap market is not automatically positive value.</span></div></div>
    <div class="toolbar"><button class="filter-pill ${kalshiOn?'active':''}" data-action="market-source" data-source="kalshi">Kalshi · Free public API</button><button class="filter-pill ${!kalshiOn?'active':''}" data-action="market-source" data-source="odds">Sportsbooks · The Odds API</button></div>
    ${kalshiOn?`<div class="card"><div class="card-header"><div><h2>Kalshi NBA contract scanner</h2><div class="card-subtitle">Read-only, public; listed contracts may be closed or unavailable at the current time</div></div>${pill('PUBLIC API','lime')}</div>
    <div class="card-body"><form id="kalshiForm" class="field-row"><div class="field"><label>Market category</label><select name="series">${[['KXNBAPTS','Player points'],['KXNBAREB','Player rebounds'],['KXNBAAST','Player assists']].map(([v,label])=>`<option value="${v}" ${state.kalshiSeries===v?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>Game date (ET)</label><input name="date" type="date" required value="${esc(state.kalshiDate)}"/></div><button class="btn primary" type="submit">${state.kalshiLoading?'Loading…':'Load market quotes'}</button></form>
    <p class="notice">Quotes are not official Pick6 projections. The public feed is refreshed on demand, cached for approximately 30 seconds and may return no markets for a given date.</p>${state.kalshiError?`<p class="note-card">${esc(state.kalshiError)}</p>`:''}${state.kalshiFetched?`<p class="small-text muted">Last checked: ${esc(state.kalshiFetched)}</p>`:''}</div>
    ${rows.length?`<div class="tracker-table"><table><thead><tr><th>Kalshi contract</th><th>Yes bid</th><th>Yes ask</th><th>No ask</th><th>Game lookup</th></tr></thead><tbody>${rows.map(m=>`<tr><td><strong>${esc(m.title||m.ticker)}</strong><br><span class="muted">${esc(m.ticker)}</span></td><td>${dollarQuote(m.yesBid)}</td><td>${dollarQuote(m.yesAsk)}</td><td>${dollarQuote(m.noAsk)}</td><td><button class="btn small ghost" data-action="track-event" data-event="${esc(m.event)}">Track game →</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${state.kalshiLoading?'Fetching Kalshi markets…':'No quotes loaded for this date. Try “Load market quotes”; some categories or dates may return no markets.'}</div>`}</div>`:
    `<div class="card"><div class="card-header"><div><h2>Sportsbook player-prop scanner</h2><div class="card-subtitle">Your private server API key is never sent to the browser</div></div>${pill('SIGN-IN REQUIRED','amber')}</div><div class="card-body"><p class="notice">This source lists sportsbook lines, not DraftKings Pick6 projections. Results require a Supabase login and a configured ODDS_API_KEY on the server.</p>
    <button class="btn ghost" data-action="odds-events" ${!state.user?'disabled':''}>${state.oddsLoading?'Loading…':'Load NBA games from The Odds API'}</button>
    ${!state.user?`<button class="btn primary" data-view="account" style="margin-left:8px">Sign in →</button>`:''}
    <form id="oddsForm" style="margin-top:17px"><div class="field-row"><div class="field"><label>Game</label><select name="eventId" required><option value="">Select an NBA game</option>${state.oddsEvents.map(e=>`<option value="${esc(e.id)}" ${state.oddsEvent===e.id?'selected':''}>${esc(e.away)} @ ${esc(e.home)}</option>`).join('')}</select></div><div class="field"><label>Stat market</label><select name="market">${[['player_points','Points'],['player_rebounds','Rebounds'],['player_assists','Assists'],['player_threes','Three-pointers'],['player_points_rebounds_assists','PRA'],['player_points_alternate','Alternate points'],['player_rebounds_alternate','Alternate rebounds'],['player_assists_alternate','Alternate assists']].map(([k,v])=>`<option value="${k}" ${state.oddsMarket===k?'selected':''}>${v}</option>`).join('')}</select></div></div><button type="submit" class="btn primary" ${!state.user?'disabled':''}>Load sportsbook props</button></form>
    ${state.oddsError?`<div class="note-card">${esc(state.oddsError)}</div>`:''}${state.oddsFetched?`<p class="notice">Last checked: ${esc(state.oddsFetched)} · No DraftKings Pick6 projections guaranteed</p>`:''}</div>
    ${odds.length?`<div class="tracker-table"><table><thead><tr><th>Player</th><th>Book</th><th>Market</th><th>Side</th><th>Projection</th><th>Odds</th></tr></thead><tbody>${odds.map(r=>`<tr><td>${esc(r.player)}</td><td>${esc(r.book)}</td><td>${esc(r.market)}</td><td>${esc(r.side)}</td><td>${esc(r.point)}</td><td>${esc(r.odds)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${state.oddsLoading?'Loading…':'No sportsbook props loaded yet.'}</div>`}</div>`}
    <div class="foot-note">NBA Edge is unaffiliated with Kalshi, DraftKings, The Odds API or the NBA. No trades or bets can be placed here.</div></div>`;
}
function dollarQuote(v) { return v===null||v===undefined||v===''?'—':('$'+Number(v).toFixed(2)); }
function renderLive() {
  const obj = state.liveInfo;
  const details = obj?.liveData?.details;
  const pretty = details === undefined ? '' : JSON.stringify(details, null, 2);
  return `<div class="page">${pageHeader('KALSHI LIVE DATA','Watch the game context.','Read-only game status and optional player-level statistics from the Kalshi milestones API.',`<button class="btn ghost" data-view="odds">Browse Kalshi markets →</button>`)}
    <div class="card"><div class="card-header"><div><h2>Find a live game by Kalshi event ticker</h2><div class="card-subtitle">Market event ticker → milestone → live game details</div></div>${pill('NO API KEY','lime')}</div>
    <div class="card-body"><form id="liveForm"><div class="field"><label>Kalshi event ticker</label><input name="eventTicker" value="${esc(state.liveTicker)}" placeholder="Paste a real event ticker from the markets scanner" required maxlength="110"/></div><button class="btn primary" type="submit">${state.liveLoading?'Checking…':'Get live game data'}</button></form>
    <p class="notice">Choose “Track game” from the Kalshi scanner to fill this automatically. Live stats may lag, and not every NBA contract has a linked milestone. Player stats require available Kalshi player mappings.</p>
    ${state.liveError?`<div class="note-card">${esc(state.liveError)}</div>`:''}</div></div>
    ${obj?`<div class="section-spacer"></div><div class="card"><div class="card-header"><div><h2>Kalshi milestone data</h2><div class="card-subtitle">Last fetched ${esc(obj.fetchedAt||'—')} · ${esc(obj.liveData?.type||'Unknown type')}</div></div>${pill('READ-ONLY','lime')}</div>
    <div class="card-body"><div class="fact-grid"><div class="fact"><small>Milestone ID</small><strong style="overflow-wrap:anywhere">${esc(obj.milestoneId)}</strong></div><div class="fact"><small>Event ticker</small><strong style="overflow-wrap:anywhere">${esc(obj.eventTicker||'Direct milestone')}</strong></div></div>
    <h3 style="margin-top:22px">Live details returned by Kalshi</h3><pre class="json-pre">${esc(pretty.length>18000?pretty.slice(0,18000)+'\n… truncated':pretty||'No details returned')}</pre><p class="notice">Displayed without assuming any undocumented field names. Do not rely on this feed to settle your Pick6 tickets; grade predictions against verified official box scores.</p></div></div>`:''}
    </div>`;
}
async function kalshiMarkets(form) {
  const data = new FormData(form);
  state.kalshiSeries = String(data.get('series'));
  state.kalshiDate = String(data.get('date'));
  state.kalshiError = ''; state.kalshiLoading = true; state.kalshiRows=[]; render();
  try {
    const response = await fetch(`/api/kalshi?${new URLSearchParams({series:state.kalshiSeries,date:state.kalshiDate})}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error||`HTTP ${response.status}`);
    state.kalshiRows = Array.isArray(body.data)?body.data:[];
    state.kalshiFetched = body.refreshed||new Date().toISOString();
    if(body.note) toast(body.note);
  } catch(e) {state.kalshiError = e.message;}
  finally {state.kalshiLoading=false;render();}
}
async function oddsEvents() {
  state.oddsLoading=true;state.oddsError='';render();
  try {
    const token = await authToken();
    const response = await fetch('/api/odds?mode=events',{headers:{Authorization:`Bearer ${token}`}});
    const body = await response.json(); if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    state.oddsEvents = Array.isArray(body.data)?body.data:[];
  } catch(e){state.oddsError=e.message;}
  finally{state.oddsLoading=false;render();}
}
async function oddsProps(form) {
  const data=new FormData(form);state.oddsEvent=String(data.get('eventId'));state.oddsMarket=String(data.get('market'));
  if(!state.oddsEvent){toast('Select an NBA game first.','error');return;}
  state.oddsLoading=true;state.oddsError='';state.oddsRows=[];render();
  try {
    const token=await authToken();
    const query=new URLSearchParams({mode:'props',eventId:state.oddsEvent,market:state.oddsMarket});
    const response=await fetch(`/api/odds?${query}`,{headers:{Authorization:`Bearer ${token}`}});
    const body=await response.json();if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    state.oddsRows=Array.isArray(body.data)?body.data:[];
    state.oddsFetched=body.refreshed||new Date().toISOString();
  }catch(e){state.oddsError=e.message;}
  finally {state.oddsLoading=false;render();}
}
async function loadLiveGame(ticker) {
  state.liveTicker = ticker || state.liveTicker;
  if(!state.liveTicker){toast('Enter an event ticker first.','error');return;}
  state.liveLoading=true;state.liveError='';state.liveInfo=null;navigate('live');
  try{
    const response=await fetch(`/api/live?${new URLSearchParams({eventTicker:state.liveTicker,stats:'1'})}`);
    const body=await response.json(); if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    state.liveInfo=body;
  }catch(e){state.liveError=e.message;}
  finally{state.liveLoading=false;render();}
}

// PREDICTION AND ACCOUNT STORAGE --------------------------------------------
function persistDemo(){localWrite(DEMO_KEYS.predictions,state.predictions);localWrite(DEMO_KEYS.entries,state.entries);}
function loadDemo(){state.predictions=localRead(DEMO_KEYS.predictions);state.entries=localRead(DEMO_KEYS.entries);}
async function authToken(){
  if(!state.client || !state.user)throw new Error('Sign in to access this market source.');
  const {data,error}=await state.client.auth.getSession();
  if(error || !data?.session?.access_token)throw new Error('Your session has expired. Please sign in.');
  return data.session.access_token;
}
async function loadAccountRecords() {
  if (!state.client || !state.user) {loadDemo();render();return;}
  const [preds,entries]=await Promise.all([
    state.client.from('predictions').select('*').order('created_at',{ascending:false}).limit(500),
    state.client.from('entries').select('*').order('created_at',{ascending:false}).limit(200)
  ]);
  if(preds.error||entries.error){toast('Account connected, but tables could not load. Run the supplied schema in Supabase.','error');return;}
  state.predictions=preds.data||[];state.entries=entries.data||[];render();
}
async function saveForecast(p) {
  const payload={id:id(),user_id:uid(),player:String(p.player||'').trim().slice(0,100),team:String(p.team||'').slice(0,12),market:p.market,side:p.side,line:Number(p.line),game_date:p.game_date||todayNY(),note:String(p.note||'').slice(0,500),result:'pending',created_at:new Date().toISOString()};
  if(!payload.player||!Number.isFinite(payload.line)||payload.line<0||!['MORE','LESS'].includes(payload.side))throw new Error('Check the player, line and side.');
  if(state.user){
    const {data,error}=await state.client.from('predictions').insert(payload).select().single();
    if(error)throw new Error(error.message);
    state.predictions.unshift(data);
  }else{delete payload.user_id;state.predictions.unshift(payload);persistDemo();}
}
async function removeForecast(recordId){
  if(state.user){const {error}=await state.client.from('predictions').delete().eq('id',recordId);if(error)throw new Error(error.message);}
  state.predictions=state.predictions.filter(p=>p.id!==recordId);if(!state.user)persistDemo();render();
}
async function gradeForecast(recordId,result){
  if(!['pending','win','loss','push','void'].includes(result))return;
  if(state.user){const {error}=await state.client.from('predictions').update({result}).eq('id',recordId);if(error)throw new Error(error.message);}
  state.predictions=state.predictions.map(p=>p.id===recordId?{...p,result}:p);if(!state.user)persistDemo();render();
}
async function saveEntry(){
  if(!state.ticket.length){toast('Add a selection before saving.','error');return;}
  const payload={id:id(),user_id:uid(),legs:state.ticket.map(x=>({...x})),status:'draft',created_at:new Date().toISOString()};
  if(state.user){const {data,error}=await state.client.from('entries').insert(payload).select().single();if(error)throw new Error(error.message);state.entries.unshift(data);}
  else {delete payload.user_id;state.entries.unshift(payload);persistDemo();}
  toast('Draft entry saved. This is not a placed bet.','success');render();
}
async function deleteEntry(entryId){
  if(state.user){const {error}=await state.client.from('entries').delete().eq('id',entryId);if(error)throw new Error(error.message);}
  state.entries=state.entries.filter(e=>e.id!==entryId);if(!state.user)persistDemo();render();
}
async function submitAuth(form) {
  if(!state.client){toast('Public registration requires a configured Supabase project.','error');return;}
  const d=new FormData(form);const email=String(d.get('email')||'').trim(),password=String(d.get('password')||'');
  if(!email||password.length<8){toast('Enter an email and password with at least 8 characters.','error');return;}
  const {data,error}=state.authMode==='signup' ? await state.client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}}) : await state.client.auth.signInWithPassword({email,password});
  if(error)throw new Error(error.message);
  if(data?.user&&!data.session)toast('Account created. Check your email for a confirmation link.','success');
  else toast(state.authMode==='signup'?'Account created and signed in.':'Signed in.','success');
}
function exportPredictionsCSV(){
  const columns=['game_date','player','team','market','side','line','result','note','created_at'];
  const safeCell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const csv=[columns.join(','),...state.predictions.map(p=>columns.map(c=>safeCell(p[c])).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='nba-edge-prediction-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function startAuth(){
  if(!HAS_BACKEND)return;
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.1?bundle');
    state.client=createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await state.client.auth.getUser();
    if(!error) state.user=data.user||null;
    state.backendReady=true;
    if(state.user)await loadAccountRecords();else render();
    state.client.auth.onAuthStateChange((event,session)=>{
      if(event==='INITIAL_SESSION')return;
      const before=state.user?.id||null;state.user=session?.user||null;
      if((state.user?.id||null)!==before){
        if(state.user)loadAccountRecords();else{loadDemo();render();}
      }
    });
  } catch {toast('Account service unavailable. You can still try the local demo.','error');}
}

// EVENT DELEGATION -----------------------------------------------------------
document.addEventListener('click',async e=>{
  const viewBtn=e.target.closest('[data-view]');
  if(viewBtn){e.preventDefault();navigate(viewBtn.dataset.view);return;}
  const btn=e.target.closest('[data-action]');if(!btn)return;
  const action=btn.dataset.action;
  try {
    if(action==='filter'){state.filter=btn.dataset.filter;render();return;}
    if(action==='open-prop'){state.selectedProp=btn.dataset.id;renderPropDetail();return;}
    if(action==='add-prop'||action==='pick-side'){
      const prop=research.find(p=>p.id===btn.dataset.id);if(!prop)return;
      addTicketLeg({player:prop.player,team:prop.team,matchup:prop.matchup,market:prop.market,side:btn.dataset.side||'MORE',line:prop.line,source:'archived-research'});return;
    }
    if(action==='add-custom'){
      const r=state.customAnalysis;if(!r)return;
      addTicketLeg({player:r.player,market:r.market,side:r.side,line:r.line,source:'manual-stat-log'});return;
    }
    if(action==='remove-leg'){state.ticket=state.ticket.filter(x=>x.id!==btn.dataset.id);render();return;}
    if(action==='clear-ticket'){state.ticket=[];state.quote={stake:'',gross:''};render();return;}
    if(action==='save-entry'){await saveEntry();return;}
    if(action==='track-ticket'){
      for(const leg of state.ticket)await saveForecast({...leg,game_date:todayNY(),note:`Draft research leg; ${leg.source}; Pick6 line not independently verified.`});
      toast(`${state.ticket.length} pending forecasts saved.`, 'success');navigate('tracking');return;
    }
    if(action==='delete-forecast'){if(confirm('Delete this prediction record?'))await removeForecast(btn.dataset.id);return;}
    if(action==='delete-entry'){if(confirm('Delete this saved draft?'))await deleteEntry(btn.dataset.id);return;}
    if(action==='export-csv'){exportPredictionsCSV();return;}
    if(action==='switch-auth'){state.authMode=btn.dataset.mode;render();return;}
    if(action==='logout'){if(state.client)await state.client.auth.signOut();state.user=null;loadDemo();render();return;}
    if(action==='market-source'){state.marketSource=btn.dataset.source;render();return;}
    if(action==='odds-events'){await oddsEvents();return;}
    if(action==='track-event'){await loadLiveGame(btn.dataset.event);return;}
  }catch(err){toast(err.message||'An error occurred.','error');}
});
document.addEventListener('input',e=>{
  if(e.target.id==='propSearch'){state.query=e.target.value;renderResearchList();}
});
document.addEventListener('change',async e=>{
  if(e.target.dataset.change==='grade'){
    const id=e.target.dataset.id;
    try{await gradeForecast(id,e.target.value);}catch(err){toast(err.message,'error');render();}
  }
});
document.addEventListener('submit',async e=>{
  const form=e.target;if(!form.id)return;e.preventDefault();
  try{
    const data=new FormData(form);
    if(form.id==='customAnalysisForm'){
      const raw=String(data.get('values')||'').split(/[,\s]+/).filter(Boolean);
      const vals=raw.map(Number),line=Number(data.get('line'));const side=String(data.get('side'));
      if(vals.length<3||vals.length>100||vals.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(line))throw new Error('Enter 3–100 valid, nonnegative stats separated by commas.');
      const sorted=[...vals].sort((a,b)=>a-b);
      const median=sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
      state.customAnalysis={player:String(data.get('player')||'').trim(),market:String(data.get('market')),side,line,hits:vals.filter(v=>side==='MORE'?v>line:v<line).length,n:vals.length,avg:vals.reduce((a,b)=>a+b,0)/vals.length,median};
      $('#customAnalysisResult').innerHTML=renderCustomAnalysisResult();return;
    }
    if(form.id==='manualLegForm'){
      const line=Number(data.get('line'));if(!Number.isFinite(line)||line<0)throw new Error('Enter a valid nonnegative projection.');
      addTicketLeg({player:String(data.get('player')||'').trim(),team:String(data.get('team')||'').trim().toUpperCase(),market:String(data.get('market')),side:String(data.get('side')),line,source:'user-entered Pick6 projection'});return;
    }
    if(form.id==='quoteForm'){
      state.quote={stake:String(data.get('stake')||''),gross:String(data.get('gross')||'')};render();return;
    }
    if(form.id==='forecastForm'){
      await saveForecast({player:String(data.get('player')||'').trim(),team:String(data.get('team')||'').trim().toUpperCase(),market:String(data.get('market')),side:String(data.get('side')),line:Number(data.get('line')),game_date:String(data.get('game_date')),note:String(data.get('note')||'')});
      toast('Pending forecast saved.','success');render();return;
    }
    if(form.id==='authForm'){await submitAuth(form);return;}
    if(form.id==='kalshiForm'){await kalshiMarkets(form);return;}
    if(form.id==='oddsForm'){await oddsProps(form);return;}
    if(form.id==='liveForm'){await loadLiveGame(String(data.get('eventTicker')||'').trim().toUpperCase());return;}
  }catch(err){toast(err.message||'Could not complete the action.','error');}
});
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#topAccountButton').addEventListener('click',()=>navigate('account'));
$('#topDate').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}).format(new Date());
window.addEventListener('hashchange',()=>{const hash=location.hash.replace('#','');if(['dashboard','analyzer','odds','live','builder','tracking','account'].includes(hash))navigate(hash);});
loadDemo();
const firstView=location.hash.replace('#','');
if(['dashboard','analyzer','odds','live','builder','tracking','account'].includes(firstView))state.view=firstView;
render();
startAuth();