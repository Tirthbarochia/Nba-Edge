const labels = {points:'Points',rebounds:'Rebounds',assists:'Assists'};
const price = n => n == null ? '—' : n > 0 ? '+' + n : String(n);
const time = iso => new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
async function read(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Unable to load lines.');
  return data;
}
class LinesBoard extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = `<section class="card" style="margin-bottom:20px"><div class="card-body"><h2>Today’s Lines</h2><div class="field-row" style="flex-wrap:wrap"><label class="field">Matchup<select data-game></select></label><label class="field">Market<select data-stat></select></label><label class="field">Sportsbook<select data-book></select></label></div><p data-status aria-live="polite">Loading upcoming games…</p><div style="overflow:auto;max-height:360px"><table><thead><tr><th>Player</th><th>Line</th><th>Over</th><th>Under</th><th>Updated (ET)</th></tr></thead><tbody></tbody></table></div></div></section>`;
    this.game = this.querySelector('[data-game]');
    this.stat = this.querySelector('[data-stat]');
    this.book = this.querySelector('[data-book]');
    this.status = this.querySelector('[data-status]');
    this.body = this.querySelector('tbody');
    for (const [key,label] of Object.entries(labels)) this.stat.add(new Option(label,key));
    this.rows = [];
    this.version = 0;
    this.game.onchange = () => this.load();
    this.stat.onchange = this.book.onchange = () => this.draw();
    try {
      const {games,date} = await read('/api/lines');
      this.date = date;
      for (const g of games) this.game.add(new Option(g.away+' at '+g.home+' · '+time(g.tip)+' ET',g.id));
      if (games.length) await this.load();
      else this.status.textContent = 'No upcoming NBA games left today.';
    } catch (err) { this.status.textContent = err.message; }
  }
  async load() {
    const version = ++this.version;
    this.rows = []; this.body.replaceChildren(); this.book.replaceChildren();
    this.status.textContent = 'Loading sportsbook quotes…';
    try {
      const {rows} = await read('/api/lines?event='+encodeURIComponent(this.game.value));
      if (version !== this.version) return;
      this.rows = rows;
      for (const book of [...new Set(rows.map(r=>r.book))].sort()) this.book.add(new Option(book,book));
      this.draw();
    } catch (err) { if (version === this.version) this.status.textContent = err.message; }
  }
  draw() {
    const rows = this.rows.filter(r=>r.book === this.book.value && r.metric === this.stat.value).sort((a,b)=>a.player.localeCompare(b.player));
    this.status.textContent = rows.length ? rows.length+' lines · Select a player to research this number.' : 'No lines available for this selection.';
    this.body.replaceChildren();
    for (const r of rows) {
      const tr = this.body.insertRow(), button = document.createElement('button');
      button.className = 'btn small'; button.textContent = r.player;
      button.onclick = () => {
        const card = this.parentElement.querySelector('nba-player-search');
        card.openLine(r,this.date);
        card.scrollIntoView({behavior:'smooth',block:'start'});
      };
      tr.insertCell().append(button);
      for (const value of [r.line,price(r.Over),price(r.Under),r.updated?time(r.updated):'—']) tr.insertCell().textContent = value;
    }
  }
}
customElements.define('nba-lines-board',LinesBoard);
