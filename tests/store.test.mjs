// Saved-snapshot behavior: visitors never trigger provider calls beyond the daily budget,
// and suggested insights stay listed after later updates. All network access is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import insightsHandler from '../api/insights.js';
import linesHandler from '../api/lines.js';
import oddsHandler from '../api/odds.js';
import { forget } from '../player-feed.js';
import recordHandler from '../api/record.js';
import askHandler from '../api/ask.js';

const NOON = Date.parse('2026-11-15T18:00:00Z');          // 1:00 PM Eastern
const TIP = '2026-11-16T00:00:00Z';                        // 7:00 PM Eastern, same Eastern day
const EVENT = 'evt0000000001';
const GAME = 'bbbteam-at-aaateam';                         // provider-independent id the site stores
const defaults = {odds_days:{version:0,refreshes:0,last_started:null,fetched_at:null,games:0,covered:0,credits_spent:0,scanner_credits:0,credits_remaining:null,credits_used:null,usage_at:null,note:null,insights_started:null,insights_at:null,sgo_objects:0,backup_refreshes:0,source:null}};
const keys = {odds_days:['slate_date'],odds_events:['slate_date','event_id'],insight_picks:['slate_date','pick_key']};

function makeRes(){return {statusCode:200,headers:{},body:null,
  setHeader(name,value){this.headers[name]=value;return this},
  status(code){this.statusCode=code;return this},
  json(data){this.body=data;return this},end(){return this}};}
const reply = (body,headers={}) => ({ok:true,status:200,headers:{get:name=>headers[name]??null},json:async()=>body,text:async()=>JSON.stringify(body)});

// A small in-memory stand-in for the Supabase REST API, covering the filters the site uses.
function fakeWorld() {
  const world = {tables:{odds_days:[],odds_events:[],insight_picks:[]}, calls:{events:0,quotes:0,scanner:0,store:0,sgo:0}, books:null, sgoProps:true, remaining:480};
  const matches = (row,query) => Object.entries(query).every(([column,filter]) => {
    if (['select','order','limit','on_conflict'].includes(column)) return true;
    if (filter === 'is.null') return row[column] == null;
    if (filter === 'not.is.null') return row[column] != null;
    if (filter === 'is.true') return row[column] === true;
    if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
    if (filter.startsWith('gte.')) return String(row[column]) >= filter.slice(4);
    throw Error('Unsupported filter ' + filter);
  });
  const store = (url,options) => {
    world.calls.store++;
    assert.equal(options.headers['x-nba-edge-server'],'test-token');
    const table = url.pathname.split('/').pop(), rows = world.tables[table];
    const query = Object.fromEntries(url.searchParams), prefer = options.headers.prefer || '';
    const body = options.body ? JSON.parse(options.body) : null;
    if (options.method === 'GET') {
      let found = rows.filter(r => matches(r,query));
      if (query.order) { const [column,direction] = query.order.split('.'); found = [...found].sort((a,b)=>String(a[column]).localeCompare(String(b[column]))*(direction==='desc'?-1:1)); }
      return reply(found.slice(0, query.limit ? Number(query.limit) : undefined).map(r => structuredClone(r)));
    }
    if (options.method === 'PATCH') {
      const found = rows.filter(r => matches(r,query));
      for (const row of found) Object.assign(row,body);
      return reply(prefer.includes('return=representation') ? found.map(r => structuredClone(r)) : '');
    }
    for (const item of [].concat(body)) {
      const existing = rows.find(r => keys[table].every(k => r[k] === item[k]));
      if (!existing) rows.push({...defaults[table],...(table==='insight_picks'?{active:true,author:'site'}:{}),...item});
      else if (prefer.includes('merge-duplicates')) Object.assign(existing,item);
      else assert.ok(prefer.includes('ignore-duplicates'),'duplicate insert without a conflict rule');
    }
    return reply('');
  };
  const player = (name,prices) => prices.flatMap(([book,over,under]) => [{book,name:'Over',description:name,point:20.5,price:over},{book,name:'Under',description:name,point:20.5,price:under}]);
  const edge = [['A',-150,120],['B',-150,120],['C',-150,120],['D',-110,-110]];
  world.lines = {first: player('Test Player',edge), flat: player('Test Player',[['A',-110,-110],['B',-110,-110],['C',-110,-110],['D',-110,-110]]), second: player('Second Player',edge)};
  world.books = world.lines.first;
  const odds = url => {
    if (url.pathname.endsWith('/events')) { world.calls.events++; return reply([{id:EVENT,home_team:'AAA Team',away_team:'BBB Team',commence_time:TIP}]); }
    if (url.searchParams.get('markets') === 'player_threes') { world.calls.scanner++; return reply({id:EVENT,bookmakers:[]},{'x-requests-last':'1','x-requests-used':'21','x-requests-remaining':'479'}); }
    world.calls.quotes++;
    const updated = new Date(Date.now()-300000).toISOString(), byBook = new Map();
    for (const o of world.books) { if (!byBook.has(o.book)) byBook.set(o.book,[]); byBook.get(o.book).push({name:o.name,description:o.description,point:o.point,price:o.price}); }
    world.remaining -= 1;
    return reply({id:EVENT,bookmakers:[...byBook].map(([title,outcomes])=>({title,markets:[{key:'player_points',last_update:updated,outcomes}]}))},
      {'x-requests-last':'1','x-requests-used':String(500-world.remaining),'x-requests-remaining':String(world.remaining)});
  };
  const sgo = (url,options) => {
    world.calls.sgo++;
    assert.equal(options.headers['x-api-key'],'sgo-key');
    assert.equal(url.searchParams.get('leagueID'),'NBA');
    const odds = {}, players = {};
    for (const o of world.sgoProps ? world.books : []) {
      const id = o.description.toUpperCase().replace(/ /g,'_') + '_1_NBA', oddID = `points-${id}-game-ou-${o.name.toLowerCase()}`;
      players[id] = {playerID:id, name:o.description};
      odds[oddID] ||= {oddID, statID:'points', statEntityID:id, periodID:'game', betTypeID:'ou', sideID:o.name.toLowerCase(), byBookmaker:{}};
      odds[oddID].byBookmaker[o.book] = {odds:(o.price > 0 ? '+' : '') + o.price, overUnder:String(o.point), available:true, lastUpdatedAt:'2026-11-15T09:00:00.000Z'};
    }
    odds['points-all-game-ou-over'] = {oddID:'points-all-game-ou-over', statID:'points', statEntityID:'all', periodID:'game', betTypeID:'ou', sideID:'over', byBookmaker:{A:{odds:'-110', overUnder:'224.5', available:true}}};
    return reply({success:true, data:[{eventID:'sgo-1', status:{startsAt:TIP}, teams:{home:{names:{long:'AAA Team'}}, away:{names:{long:'BBB Team'}}}, players, odds}]});
  };
  const espn = url => {
    const path = url.pathname;
    if (path.endsWith('/teams')) return reply({sports:[{leagues:[{teams:[{team:{id:'1',abbreviation:'AAA'}},{team:{id:'2',abbreviation:'BBB'}}]}]}]});
    if (path.endsWith('/1/roster')) return reply({team:{abbreviation:'AAA'},athletes:[{id:'101',displayName:'Test Player'},{id:'102',displayName:'Second Player',injuries:world.injured ? [{status:'Out'}] : []}]});
    if (path.endsWith('/statistics/byteam')) return reply(world.byteam);
    if (path.endsWith('/2/roster')) return reply({team:{abbreviation:'BBB'},athletes:[]});
    if (path.endsWith('/scoreboard')) { world.calls.scoreboard = (world.calls.scoreboard || 0) + 1; return reply({events:[{id:'g99',date:TIP,season:{year:2027},status:{type:{shortDetail:world.final ? 'Final' : '7:00 PM',completed:Boolean(world.final)}},competitions:[{competitors:[{homeAway:'home',team:{id:'1',abbreviation:'AAA'}},{homeAway:'away',team:{id:'2',abbreviation:'BBB'}}]}]}]}); }
    const events = {}, rows = [];
    const who = path.split('/').at(-2);
    for (let i=1; i<=12; i++) {
      // Player 102 sat out games 9-12; player 101 scored more in those games.
      if (world.injured && who === '102' && i > 8) continue;
      events['g'+i] = {gameDate:`2026-11-${String(i).padStart(2,'0')}T00:30:00Z`,gameResult:'W',atVs:i % 2 ? 'vs' : '@',team:{id:'1'},opponent:{id:'3',abbreviation:'CCC'}};
      rows.push({eventId:'g'+i,stats:['30', world.injured && who === '101' && i > 8 ? '31' : '25','5','5']});
    }
    const final = world.final?.[path.split('/').at(-2)];
    if (final != null) { events.g99 = {gameDate:TIP,gameResult:'L',opponent:{abbreviation:'BBB'}}; rows.unshift({eventId:'g99',stats:['31',String(final),'4','6']}); }
    return reply({names:['minutes','points','totalRebounds','assists'],events,seasonTypes:[{displayName:'2026-27 Regular Season',categories:[{events:rows}]}]});
  };
  world.fetch = async (input,options={}) => {
    const url = new URL(String(input));
    if (url.hostname === 'store.test') return url.pathname.startsWith('/auth/') ? reply({id:'user-1'}) : store(url,{method:'GET',...options});
    if (url.hostname === 'api.the-odds-api.com') return odds(url);
    if (url.hostname === 'api.sportsgameodds.com') return sgo(url,options);
    if (url.hostname.endsWith('espn.com')) return espn(url);
    throw Error('Unexpected request to ' + url.hostname);
  };
  return world;
}

async function scenario(t, {now = NOON, env = {}} = {}) {
  forget();
  const world = fakeWorld(), realFetch = global.fetch, saved = {...process.env};
  Object.assign(process.env,{SUPABASE_URL:'https://store.test',SUPABASE_PUBLISHABLE_KEY:'public',NBA_EDGE_SERVER_TOKEN:'test-token',ODDS_API_KEY:'key',...env});
  if (!('SPORTSGAMEODDS_API_KEY' in env)) delete process.env.SPORTSGAMEODDS_API_KEY;
  for (const [key,value] of Object.entries(env)) if (value === null) delete process.env[key];
  global.fetch = world.fetch;
  t.mock.timers.enable({apis:['Date'],now});
  t.after(() => { global.fetch = realFetch; for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); });
  world.insights = async () => { const res = makeRes(); await insightsHandler({method:'GET',query:{}},res); return res; };
  world.lines = Object.assign(async (query={}) => { const res = makeRes(); await linesHandler({method:'GET',query},res); return res; }, world.lines);
  return world;
}

test('the first visit after 11 AM buys one snapshot; later visits read the saved copy', async t => {
  const world = await scenario(t);
  const first = await world.insights();
  assert.equal(first.statusCode,200);
  assert.equal(first.body.status,'ready');
  assert.deepEqual([world.calls.events,world.calls.quotes],[1,1]);
  assert.equal(first.body.picks.length,1);
  assert.equal(first.body.picks[0].player,'Test Player');
  assert.equal(first.body.picks[0].active,true);
  const board = await world.lines();
  assert.equal(board.body.games.length,1);
  const rows = await world.lines({event:GAME});
  assert.equal(rows.body.rows.length,4);
  assert.ok(rows.body.updated);
  await world.insights();
  assert.deepEqual([world.calls.events,world.calls.quotes],[1,1],'no further provider calls');
  const day = world.tables.odds_days[0];
  assert.deepEqual([day.refreshes,day.credits_spent,day.credits_remaining],[1,1,479]);
});

test('many simultaneous visitors still cause a single provider refresh', async t => {
  const world = await scenario(t);
  const all = await Promise.all(Array.from({length:6},() => world.insights()));
  assert.ok(all.every(res => res.statusCode === 200));
  assert.deepEqual([world.calls.events,world.calls.quotes],[1,1]);
  assert.equal((await world.insights()).body.picks.length,1);
});

test('nothing is bought before the first refresh hour', async t => {
  const world = await scenario(t,{now:Date.parse('2026-11-15T14:00:00Z')});
  const res = await world.insights();
  assert.equal(res.body.status,'scheduled');
  assert.deepEqual(res.body.picks,[]);
  assert.deepEqual([world.calls.events,world.calls.quotes],[0,0]);
});

test('a suggested insight stays listed after a later update replaces it', async t => {
  const world = await scenario(t,{env:{ODDS_REFRESHES_PER_DAY:'2'}});
  assert.equal((await world.insights()).body.picks.length,1);
  world.books = [...world.lines.flat,...world.lines.second];
  t.mock.timers.setTime(NOON + 30*60000);
  await world.insights();
  assert.equal(world.calls.quotes,1,'second refresh waits for the minimum spacing');
  t.mock.timers.setTime(NOON + 61*60000);
  const later = await world.insights();
  assert.equal(world.calls.quotes,2);
  assert.deepEqual(later.body.picks.map(p => [p.player,p.active]),[['Second Player',true],['Test Player',false]]);
  const kept = world.tables.insight_picks.find(r => r.player === 'Test Player');
  assert.equal(kept.first_pick.price,-110,'the original suggestion is preserved');
  t.mock.timers.setTime(NOON + 200*60000);
  await world.insights();
  assert.equal(world.calls.quotes,2,'daily limit of two refreshes holds');
});

test('a suggestion remains after its game has started', async t => {
  const world = await scenario(t);
  await world.insights();
  t.mock.timers.setTime(Date.parse(TIP) + 3600000);
  const res = await world.insights();
  assert.equal(res.body.picks.length,1);
  assert.equal((await world.lines()).body.games.length,0);
  assert.equal(world.calls.quotes,1);
});

test('a refresh is skipped when the remaining allowance cannot cover it', async t => {
  const world = await scenario(t);
  world.tables.odds_days.push({...defaults.odds_days,slate_date:'2026-11-14',credits_remaining:2,usage_at:'2026-11-15T03:00:00.000Z'});
  const res = await world.insights();
  assert.equal(res.body.status,'allowance');
  assert.equal(world.calls.quotes,0);
});

test('without the server token the public routes fail closed and call nothing', async t => {
  const world = await scenario(t,{env:{NBA_EDGE_SERVER_TOKEN:null}});
  assert.equal((await world.insights()).statusCode,503);
  assert.equal((await world.lines()).statusCode,503);
  assert.deepEqual(world.calls,{events:0,quotes:0,scanner:0,store:0,sgo:0});
});

test('the signed-in scanner stops at its daily credit allowance', async t => {
  const world = await scenario(t,{env:{ODDS_SCANNER_DAILY_CREDITS:'1'}});
  const ask = async market => { const res = makeRes(); await oddsHandler({method:'GET',query:{mode:'props',eventId:EVENT,market},headers:{authorization:'Bearer token'}},res); return res; };
  assert.equal((await ask('player_threes')).statusCode,200);
  assert.equal(world.calls.scanner,1);
  const blocked = await ask('player_threes_alternate');
  assert.equal(blocked.statusCode,429);
  assert.equal(world.calls.scanner,1);
  assert.equal(world.tables.odds_days[0].scanner_credits,1);
});

test('an exhausted provider allowance is reported as such and costs nothing', async t => {
  const world = await scenario(t);
  const inner = world.fetch;
  global.fetch = async (input,options) => String(input).includes('the-odds-api.com')
    ? {ok:false,status:401,headers:{get:()=>null},json:async()=>({message:'Usage quota has been reached.',error_code:'OUT_OF_USAGE_CREDITS'})}
    : inner(input,options);
  t.mock.method(console,'warn',()=>{});
  const res = await world.insights();
  assert.equal(res.body.status,'allowance');
  assert.deepEqual([world.tables.odds_days[0].refreshes,world.tables.odds_days[0].credits_spent],[0,0]);
});

test('a stale allowance figure does not block the backup provider forever', async t => {
  const world = await scenario(t);
  world.tables.odds_days.push({...defaults.odds_days,slate_date:'2026-11-10',credits_remaining:0,usage_at:'2026-11-10T16:00:00.000Z'});
  assert.equal((await world.insights()).body.status,'ready');
  assert.equal(world.calls.quotes,1);
});

const SGO = {SPORTSGAMEODDS_API_KEY:'sgo-key'};
test('SportsGameOdds is used first and bills one object per game', async t => {
  const world = await scenario(t,{env:SGO});
  const res = await world.insights();
  assert.equal(res.body.status,'ready');
  assert.deepEqual([world.calls.sgo,world.calls.events,world.calls.quotes],[1,0,0]);
  assert.deepEqual(res.body.picks.map(p => [p.player,p.book,p.price,p.line]),[['Test Player','D',-110,20.5]]);
  const day = world.tables.odds_days[0];
  assert.deepEqual([day.source,day.sgo_objects,day.credits_spent,day.backup_refreshes],['sgo',1,0,0]);
  assert.equal((await world.lines({event:GAME})).body.rows.length,4);
  await world.insights();
  assert.equal(world.calls.sgo,1,'later visits read the saved copy');
});

test('with SportsGameOdds the site refreshes through the day, spaced 90 minutes apart, up to the daily limit', async t => {
  const world = await scenario(t,{env:{...SGO,SGO_REFRESHES_PER_DAY:'3'}});
  await world.insights();
  for (const minutes of [60,91,150,185,400]) { t.mock.timers.setTime(NOON + minutes*60000); await world.insights(); }
  assert.equal(world.calls.sgo,3);
  assert.equal(world.calls.quotes,0);
  assert.equal(world.tables.odds_days[0].sgo_objects,3);
});

test('when the SportsGameOdds monthly allowance is nearly used, The Odds API backup is used once', async t => {
  const world = await scenario(t,{env:SGO});
  world.tables.odds_days.push({...defaults.odds_days,slate_date:'2026-11-01',sgo_objects:2490});
  const res = await world.insights();
  assert.equal(res.body.status,'ready');
  assert.deepEqual([world.calls.sgo,world.calls.quotes],[0,1]);
  const day = world.tables.odds_days.find(d => d.slate_date === '2026-11-15');
  assert.deepEqual([day.source,day.backup_refreshes],['odds-api',1]);
  t.mock.timers.setTime(NOON + 100*60000);
  await world.insights();
  assert.equal(world.calls.quotes,1,'the backup is limited to one refresh a day');
});

test('if SportsGameOdds returns games without player lines, the backup supplies them', async t => {
  const world = await scenario(t,{env:SGO});
  world.sgoProps = false;
  t.mock.method(console,'warn',()=>{});
  const res = await world.insights();
  assert.equal(res.body.status,'ready');
  assert.deepEqual([world.calls.sgo,world.calls.quotes],[1,1]);
  const day = world.tables.odds_days[0];
  assert.deepEqual([day.source,day.sgo_objects],['odds-api',1]);
});

test('with no backup allowance and no posted lines the page says so and the game list is not lost', async t => {
  const world = await scenario(t,{env:{...SGO,ODDS_API_KEY:null}});
  world.sgoProps = false;
  t.mock.method(console,'warn',()=>{});
  const res = await world.insights();
  assert.equal(res.body.status,'no-lines');
  assert.deepEqual([world.tables.odds_days[0].refreshes,world.tables.odds_days[0].sgo_objects],[1,1]);
});

// Track record: each published insight is graded from the final box score.
test('a finished pick is graded at its line and the record and streak are reported', async t => {
  const world = await scenario(t);
  const first = await world.insights();
  assert.deepEqual(first.body.record,{hits:0,misses:0,pushes:0,voids:0,pending:0,rate:null,units:0,streak:null,best:0,days:[],recent:[]});
  const saved = world.tables.insight_picks[0];
  assert.deepEqual([saved.first_pick.athlete,saved.first_pick.team],['101','1'],'player id is stored for grading');
  t.mock.timers.setTime(Date.parse(TIP) + 2*3600000);
  assert.equal((await world.insights()).body.record.pending,1,'started but too early to grade');
  world.final = {'101':24};
  t.mock.timers.setTime(Date.parse(TIP) + 3.5*3600000);
  const res = await world.insights();
  const r = res.body.record;
  assert.deepEqual([r.hits,r.misses,r.rate,r.streak,r.best,r.pending],[1,0,1,{result:'hit',count:1},1,0]);
  assert.equal(r.units,0.91,'one unit at -110 returns 0.91');
  assert.deepEqual(r.days,[{date:'2026-11-15',hits:1,misses:0,pushes:0,voids:0}]);
  assert.deepEqual(r.recent[0],{date:'2026-11-15',player:'Test Player',metric:'points',line:20.5,side:'Over',price:-110,book:'D',result:'hit',actual:24});
  assert.deepEqual([res.body.picks[0].result,res.body.picks[0].actual],['hit',24]);
});

test('an unfinished game is re-checked at most every 30 minutes, and a pick graded once stays graded', async t => {
  const world = await scenario(t);
  await world.insights();
  t.mock.timers.setTime(Date.parse(TIP) + 3.5*3600000);
  await world.insights();
  const checks = world.calls.scoreboard;
  t.mock.timers.setTime(Date.parse(TIP) + 3.8*3600000);
  await world.insights();
  assert.equal(world.calls.scoreboard,checks,'no new box-score lookup within 30 minutes');
  world.final = {'101':12};
  t.mock.timers.setTime(Date.parse(TIP) + 4.1*3600000);
  assert.equal((await world.insights()).body.record.misses,1);
  world.final = {'101':40};
  t.mock.timers.setTime(Date.parse(TIP) + 6*3600000);
  const r = (await world.insights()).body.record;
  assert.deepEqual([r.hits,r.misses,r.units,r.streak],[0,1,-1,{result:'miss',count:1}]);
});

test('a player with no box score line 36 hours after tip-off is void and does not count', async t => {
  const world = await scenario(t);
  await world.insights();
  world.final = {'999':30};
  t.mock.timers.setTime(Date.parse(TIP) + 5*3600000);
  assert.equal((await world.insights()).body.record.voids,0,'waits before calling it void');
  t.mock.timers.setTime(Date.parse(TIP) + 37*3600000);
  const r = (await world.insights()).body.record;
  assert.deepEqual([r.voids,r.hits,r.misses,r.rate,r.streak],[1,0,0,null,null]);
});

test('picks saved before player ids were stored are matched by name for grading', async t => {
  const world = await scenario(t);
  await world.insights();
  delete world.tables.insight_picks[0].first_pick.athlete;
  delete world.tables.insight_picks[0].first_pick.team;
  world.final = {'101':20};
  t.mock.timers.setTime(Date.parse(TIP) + 4*3600000);
  const r = (await world.insights()).body.record;
  assert.deepEqual([r.misses,r.recent[0].actual],[1,20]);
});

test("Claude's picks are listed and graded separately and are never touched by the site's refresh", async t => {
  const world = await scenario(t,{env:{ODDS_REFRESHES_PER_DAY:'2'}});
  await world.insights();
  const claude = {slate_date:'2026-11-15',pick_key:'claude_secondplayer_points_20p5_under',player:'Second Player',metric:'points',line:20.5,side:'Under',author:'claude',active:true,
    first_pick:{player:'Second Player',metric:'points',line:20.5,side:'Under',price:120,book:'A',home:'AAA Team',away:'BBB Team',tip:TIP,reason:'Minutes drop expected with the starter back from injury tonight.'},
    first_suggested_at:'2026-11-15T20:00:00.000Z',last_confirmed_at:'2026-11-15T20:00:00.000Z'};
  claude.pick = claude.first_pick;
  world.tables.insight_picks.push(claude);
  t.mock.timers.setTime(NOON + 61*60000);
  world.books = [...world.lines.flat];
  const res = await world.insights();
  assert.deepEqual(res.body.picks.map(p => p.player),['Test Player'],'site list excludes Claude picks');
  assert.equal(res.body.claude.picks[0].reason,'Minutes drop expected with the starter back from injury tonight.');
  assert.equal(world.tables.insight_picks.find(r => r.author === 'claude').active,true,'the site refresh never deactivates a Claude pick');
  world.final = {'101':25,'102':18};
  t.mock.timers.setTime(Date.parse(TIP) + 4*3600000);
  const later = await world.insights();
  assert.deepEqual([later.body.record.hits,later.body.record.misses],[1,0]);
  assert.deepEqual([later.body.claude.record.hits,later.body.claude.record.units,later.body.claude.picks[0].result],[1,1.2,'hit']);
});

test('the Track record route returns a separate graded record for each model', async t => {
  const world = await scenario(t);
  await world.insights();
  world.tables.insight_picks.push({slate_date:'2026-11-15',pick_key:'claude_secondplayer_points_20p5_under',player:'Second Player',metric:'points',line:20.5,side:'Under',author:'claude',active:true,
    first_pick:{tip:TIP,price:-110,book:'A'},pick:{},first_suggested_at:'2026-11-15T20:00:00.000Z',last_confirmed_at:'2026-11-15T20:00:00.000Z'});
  world.final = {'101':25,'102':22};
  t.mock.timers.setTime(Date.parse(TIP) + 4*3600000);
  const res = makeRes();
  await recordHandler({method:'GET',query:{}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual([res.body.site.hits,res.body.site.misses,res.body.claude.hits,res.body.claude.misses],[1,0,0,1]);
  assert.deepEqual([res.body.site.recent[0].player,res.body.claude.recent[0].player],['Test Player','Second Player']);
});

test('the Prop analyzer returns a matchup projection with teammates out, venue and opponent', async t => {
  const world = await scenario(t);
  world.injured = true;
  const team = (id, abbr, pts) => ({team:{id, abbreviation:abbr}, categories:[
    {name:'general', splitId:'0', values:[0,0,0,0,0,0,0,12]}, {name:'general', splitId:'900', values:[0,44]},
    {name:'offensive', splitId:'900', values:[pts,0,0,0,0,0,0,0,0,0,0,0,0,27]}]});
  world.byteam = {categories:[{name:'general', names:['totalRebounds','avgRebounds','x','x','x','x','x','gamesPlayed']}, {name:'general'},
    {name:'offensive', names:['avgPoints','x','x','x','x','x','x','x','x','x','x','x','x','avgAssists']}, {name:'offensive'}],
    teams:[team('1','AAA',110), team('2','BBB',125), team('3','CCC',115)]};
  const res = makeRes();
  await askHandler({method:'GET', query:{player:'101', team:'1', date:'2026-11-15', metric:'points'}}, res);
  assert.equal(res.statusCode, 200);
  const m = res.body.model;
  assert.ok(m, 'projection attached');
  assert.equal(m.home, true);
  const step = key => m.steps.find(s => s.key === key);
  assert.match(step('teammates').detail, /Second Player out · 4 games without/);
  assert.ok(step('teammates').change > 0);
  assert.match(step('opponent').detail, /BBB allow 125\.0 per game · league 116\.7/);
  assert.ok(step('opponent').change > 0);
  assert.ok(step('venue'));
  assert.ok(m.mean > 25);
});
