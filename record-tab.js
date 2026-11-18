import {trackRecord} from './record-view.js';
// Track record page: one tab per model, each graded separately from final box scores.
const models = {
  site:{label:'NBA Edge model',about:'The site’s automatic screen: a sportsbook price better than the other books, backed by recent and season form. Every insight it has published is graded at the line it was first suggested.'},
  claude:{label:'Claude’s picks',about:'Lines chosen each afternoon by Claude, an AI model, after reading injury news, rotation changes and today’s saved sportsbook prices. Graded the same way, on its own record. Research, not a guarantee.'}
};
class TrackRecord extends HTMLElement {
  connectedCallback(){
    this.model = sessionStorageGet() || 'site';
    this.innerHTML='<section class="card" style="margin-bottom:20px"><div class="card-body"><h1 class="page-title">Track record</h1><p class="muted small-text">Every pick is graded against the final box score at the line it was first suggested. Over wins above the line, Under below it. Pushes and players who sit out don’t count.</p><div class="filter-row" role="tablist" style="margin:16px 0" data-tabs></div><p class="muted small-text" data-about></p><div data-body aria-live="polite"><p class="muted">Loading the track record…</p></div></div></section>';
    const tabs=this.querySelector('[data-tabs]');
    for(const [key,m] of Object.entries(models)){
      const b=document.createElement('button');
      b.className='filter-pill';b.setAttribute('role','tab');b.dataset.model=key;b.textContent=m.label;
      b.onclick=()=>{this.model=key;sessionStorageSet(key);this.paint();};
      tabs.append(b);
    }
    this.load();this.timer=setInterval(()=>this.load(),300000);
  }
  disconnectedCallback(){clearInterval(this.timer);}
  async load(){
    try{
      const response=await fetch('/api/record');
      if(!response.ok)throw Error();
      this.data=await response.json();
    }catch{this.data=null;}
    this.paint();
  }
  paint(){
    for(const b of this.querySelectorAll('[data-model]')){const on=b.dataset.model===this.model;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));}
    this.querySelector('[data-about]').textContent=models[this.model].about;
    const body=this.querySelector('[data-body]');
    if(this.data===undefined)return;
    body.innerHTML=this.data?trackRecord(this.data[this.model]):'<p class="muted">The track record is unavailable right now. It will retry in a few minutes.</p>';
  }
}
// The chosen tab is remembered for this browser tab only; storage can be unavailable.
function sessionStorageGet(){try{const v=sessionStorage.getItem('nba-record-model');return v in models?v:null;}catch{return null;}}
function sessionStorageSet(v){try{sessionStorage.setItem('nba-record-model',v);}catch{}}
customElements.define('nba-record',TrackRecord);
