import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, units, summarize } from '../record.js';

test('picks are judged strictly against the line, with ties as pushes', () => {
  assert.deepEqual([judge('Over',20.5,21),judge('Over',20.5,20),judge('Under',6.5,6),judge('Under',6.5,7),judge('Over',20,20),judge('Under',20,20)],
    ['hit','miss','hit','miss','push','push']);
});

test('units pay out at the suggested American price', () => {
  assert.deepEqual([units('hit',-110),units('hit',150),units('miss',-200),units('push',-110),units('void',120)].map(v=>Math.round(v*1000)/1000),[0.909,1.5,-1,0,0]);
});

test('streaks run in game order and skip pushes and voids', () => {
  const row = (date,tip,result,key=tip) => ({slate_date:date,pick_key:key,player:'P'+key,metric:'points',line:10.5,side:'Over',first_pick:{tip,price:-110},first_suggested_at:tip,result,actual:result==='hit'?12:8});
  const rows = [
    row('2026-11-10','2026-11-11T00:00:00Z','hit'),
    row('2026-11-10','2026-11-11T01:00:00Z','hit'),
    row('2026-11-10','2026-11-11T02:00:00Z','hit'),
    row('2026-11-11','2026-11-12T00:00:00Z','miss'),
    row('2026-11-12','2026-11-13T00:00:00Z','hit'),
    row('2026-11-12','2026-11-13T00:30:00Z','push'),
    row('2026-11-12','2026-11-13T01:00:00Z','void'),
    row('2026-11-13','2026-11-14T00:00:00Z','hit'),
    row('2026-11-14','2026-11-15T00:00:00Z',null)
  ].reverse();
  const r = summarize(rows, Date.parse('2026-11-15T01:00:00Z'));
  assert.deepEqual([r.hits,r.misses,r.pushes,r.voids,r.pending],[5,1,1,1,1]);
  assert.deepEqual(r.streak,{result:'hit',count:2});
  assert.equal(r.best,3);
  assert.equal(Math.round(r.rate*1000),833);
  assert.equal(r.units,3.55);
  assert.deepEqual(r.days.map(d=>[d.date,d.hits,d.misses]),[['2026-11-13',1,0],['2026-11-12',1,0],['2026-11-11',0,1],['2026-11-10',3,0]]);
  assert.equal(r.recent[0].date,'2026-11-13');
  assert.equal(r.recent.length,8);
});
