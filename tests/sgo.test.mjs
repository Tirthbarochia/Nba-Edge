import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromEvent } from '../sgo-feed.js';

const odd = (stat, id, side, byBookmaker, extra = {}) => ({statID:stat, statEntityID:id, periodID:'game', betTypeID:'ou', sideID:side, byBookmaker, ...extra});
test('SportsGameOdds odds become one row per player, stat, book and line', () => {
  const event = {players:{LEBRON_JAMES_1_NBA:{name:'LeBron James'}}, odds:{
    a: odd('points','LEBRON_JAMES_1_NBA','over',{fanduel:{odds:'-105',overUnder:'27.5',available:true}, draftkings:{odds:'-115',overUnder:'26.5',available:true}, betmgm:{odds:'-110',overUnder:'27.5',available:false}}),
    b: odd('points','LEBRON_JAMES_1_NBA','under',{fanduel:{odds:'-115',overUnder:'27.5',available:true}, draftkings:{odds:'+100',overUnder:'26.5',available:true}}),
    c: odd('assists','JAREN_JACKSON_JR_1_NBA','over',{fanduel:{odds:'+120',overUnder:'2.5',available:true}}),
    d: odd('points','all','over',{fanduel:{odds:'-110',overUnder:'224.5',available:true}}),
    e: odd('points','LEBRON_JAMES_1_NBA','over',{fanduel:{odds:'-110',overUnder:'13.5',available:true}},{periodID:'1h'}),
    f: odd('steals','LEBRON_JAMES_1_NBA','over',{fanduel:{odds:'-110',overUnder:'1.5',available:true}}),
    g: odd('rebounds','LEBRON_JAMES_1_NBA','over',{fanduel:{odds:'even',overUnder:'7.5',available:true}, caesars:{odds:'-120',available:true}})
  }};
  const rows = rowsFromEvent(event,'2026-11-15T18:00:00.000Z');
  assert.deepEqual(rows,[
    {player:'LeBron James',line:27.5,metric:'points',book:'FanDuel',updated:'2026-11-15T18:00:00.000Z',Over:-105,Under:-115},
    {player:'LeBron James',line:26.5,metric:'points',book:'DraftKings',updated:'2026-11-15T18:00:00.000Z',Over:-115,Under:100},
    {player:'Jaren Jackson Jr',line:2.5,metric:'assists',book:'FanDuel',updated:'2026-11-15T18:00:00.000Z',Over:120}
  ]);
});
