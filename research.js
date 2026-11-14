// Archived research input from the user's November 13, 2026 notes.
// NOT live DraftKings Pick6 projections, calibrated probabilities, or current NBA data.
export const SNAPSHOT_DATE = '2026-11-13';
export const games = [
  ['NYK','IND','7:00 PM ET'],['MIL','ORL','7:00 PM ET'],['CLE','MIA','8:00 PM ET'],
  ['ATL','CHI','8:00 PM ET'],['MEM','NOP','8:00 PM ET'],['UTA','HOU','8:30 PM ET'],
  ['GSW','SAS','9:30 PM ET'],['POR','SAC','10:00 PM ET'],['OKC','LAC','10:30 PM ET']
];
// "20+" is represented as MORE 19.5 for a half-point projection.
// This representation does NOT mean that Pick6 actually offers 19.5.
export const research = [
  {id:'davion-pra',player:'Davion Mitchell',team:'MIA',matchup:'CLE @ MIA',market:'PRA',threshold:'20+ PRA',line:19.5,hits:10,n:10,rating:'Candidate',risk:'The researched 20+ floor is not the same as the higher mainstream PRA line. Confirm the actual Pick6 projection.',notes:'Very consistent at the user-specified threshold, but the recent 10/10 is descriptive, not a predictive 100% probability.'},
  {id:'hartenstein-ast',player:'Isaiah Hartenstein',team:'OKC',matchup:'OKC @ LAC',market:'AST',threshold:'3+ assists',line:2.5,hits:8,n:10,rating:'Candidate',risk:'A 3.5 assist line is materially harder than 3+. Check role and teammate availability.',notes:'Eight of ten at the research threshold; look for stable passing minutes and potential assists.'},
  {id:'podz-reb',player:'Brandin Podziemski',team:'GSW',matchup:'GSW @ SAS',market:'REB',threshold:'5+ rebounds',line:4.5,hits:7,n:10,rating:'Watch',risk:'Warriors rotation uncertainty and matchup can swing minutes/rebounds.',notes:'Rebound opportunity depends on lineup and time on court.'},
  {id:'sengun-pra',player:'Alperen Sengun',team:'HOU',matchup:'UTA @ HOU',market:'PRA',threshold:'37+ PRA',line:36.5,hits:7,n:10,rating:'Watch',risk:'Possible blowout or minutes reduction. Correlates heavily with Sengun P+R.',notes:'Do not combine with the second Sengun prop without explicitly analyzing the dependency.'},
  {id:'towns-reb',player:'Karl-Anthony Towns',team:'NYK',matchup:'NYK @ IND',market:'REB',threshold:'13+ rebounds',line:12.5,hits:6,n:10,rating:'Pass',risk:'Only 6 of 10 recent matches cleared this relatively high rebounding bar.',notes:'A higher ceiling prop needs stronger opportunity evidence than recent rebounds alone.'},
  {id:'donovan-pts',player:'Donovan Mitchell',team:'CLE',matchup:'CLE @ MIA',market:'PTS',threshold:'25+ points',line:24.5,hits:3,n:10,rating:'Pass',risk:'Recent scoring distribution does not support a confident over at this threshold.',notes:'Check shooting volume and opponent before considering alternatives.'},
  {id:'brunson-3pm',player:'Jalen Brunson',team:'NYK',matchup:'NYK @ IND',market:'3PM',threshold:'2+ threes',line:1.5,hits:7,n:10,rating:'Watch',risk:'Three-point variance and potential shift in shot mix.',notes:'Do not substitute a posted 2.5 line without re-evaluating.'},
  {id:'wemby-3pm',player:'Victor Wembanyama',team:'SAS',matchup:'GSW @ SAS',market:'3PM',threshold:'2+ threes',line:1.5,hits:7,n:10,rating:'Watch',risk:'Three-point volume and opponent scheme can change from game to game.',notes:'Recent hit rate is not enough to call a 2+ outcome safe.'},
  {id:'giannis-pts',player:'Giannis Antetokounmpo',team:'MIL',matchup:'MIL @ ORL',market:'PTS',threshold:'27+ points',line:26.5,hits:7,n:10,rating:'Conditional',risk:'Prior injury designation was probable. Recheck clearance, workload and the current line.',notes:'Only consider once availability is confirmed.'},
  {id:'sengun-pr',player:'Alperen Sengun',team:'HOU',matchup:'UTA @ HOU',market:'P+R',threshold:'28+ points + rebounds',line:27.5,hits:7,n:10,rating:'Watch',risk:'Highly correlated with Sengun PRA. Potential blowout risk.',notes:'Alternate to Sengun PRA, not an automatic additional leg.'},
  {id:'jabari-3pm',player:'Jabari Smith Jr.',team:'HOU',matchup:'UTA @ HOU',market:'3PM',threshold:'2+ threes',line:1.5,hits:9,n:10,rating:'Candidate',risk:'If Pick6 offers 2.5 rather than 1.5, the recent 3+ hit rate is much weaker.',notes:'The offered threshold matters substantially more than the headline 9/10.'},
  {id:'harden-3pm',player:'James Harden',team:'CLE',matchup:'CLE @ MIA',market:'3PM',threshold:'2+ threes',line:1.5,hits:9,n:10,rating:'Candidate',risk:'Line inflation from 1.5 to 2.5 substantially changes the case.',notes:'Historic 2+ trend; look for minutes, attempts and actual posted Pick6 projection.'},
  {id:'bey-ast',player:'Saddiq Bey',team:'NOP',matchup:'MEM @ NOP',market:'AST',threshold:'2+ assists',line:1.5,hits:8,n:10,rating:'Candidate',risk:'Assist lines are sensitive to role and teammates converting shots.',notes:'Not a meaningful advantage unless Pick6 is offering 1.5 at a fair payout.'}
];