import test from 'node:test';
import assert from 'node:assert/strict';
import liveHandler from '../api/live.js';
import kalshiHandler from '../api/kalshi.js';
import oddsHandler from '../api/odds.js';

function makeRes(){return {statusCode:200,headers:{},body:null,
  setHeader(name,value){this.headers[name]=value;return this},
  status(code){this.statusCode=code;return this},
  json(data){this.body=data;return this}
};}
function ok(body){return {ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)};}

test('Kalshi live milestone event lookup resolves then requests player stats', async()=>{
 const realFetch=global.fetch;
 const calls=[];
 global.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('/milestones?'))return ok({milestones:[{id:'42abc4-11',related_event_tickers:['KXNBAGAME-26NOV13AB'],type:'basketball_game'}]});
  return ok({live_data:{type:'basketball_game',milestone_id:'42abc4-11',details:{status:'scheduled'}}});
 };
 try{
  const res=makeRes();await liveHandler({method:'GET',query:{eventTicker:'KXNBAGAME-26NOV13AB',stats:'1'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.milestoneId,'42abc4-11');
  assert.ok(calls[1].includes('include_player_stats=true'));
  assert.equal(res.body.liveData.details.status,'scheduled');
 }finally{global.fetch=realFetch;}
});

test('Kalshi live rejects unsafe paths',async()=>{
 const res=makeRes();await liveHandler({method:'GET',query:{milestoneId:'../../private'}},res);
 assert.equal(res.statusCode,400);
});

test('Kalshi markets filters a particular date and extracts snapshot ask',async()=>{
 const realFetch=global.fetch;
 global.fetch=async url=>ok({markets:[
  {ticker:'X-1',event_ticker:'KXNBAPTS-26NOV13NYKIND',title:'Player points',yes_ask_dollars:'0.63'},
  {ticker:'X-2',event_ticker:'KXNBAPTS-26NOV14NYKIND',title:'Other game',yes_ask_dollars:'0.31'}
 ]});
 try{
  const res=makeRes();await kalshiHandler({method:'GET',query:{series:'KXNBAPTS',date:'2026-11-13'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.data.length,1);
  assert.equal(res.body.data[0].yesAsk,.63);
 }finally{global.fetch=realFetch;}
});

test('Sportsbook proxy refuses requests without auth token',async()=>{
 const res=makeRes();await oddsHandler({method:'GET',query:{mode:'events'},headers:{}},res);
 assert.equal(res.statusCode,401);assert.ok(!JSON.stringify(res.body).includes('apiKey'));
});