import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {legal,apply,notation,distance} from '../src/engine.js';
const games=JSON.parse(readFileSync('evaluation/sigma4-natural-opening-games.json','utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stateKey=s=>hash([s.p,s.walls.map(w=>[w.x,w.y,w.o]).sort(),s.left,s.turn]);
const rows=[];
for(const g of games.games){
 for(const t of g.trace){
  if(t.variant!=='sigma3'||!legal(t.state,t.action))continue;
  const candidates=t.rootCandidates.filter(c=>legal(t.state,c.action)&&c.visits>=5&&Number.isFinite(c.qFromRoot));
  const leader=candidates[0];
  if(!leader||candidates.length<2)continue;
  const choices=candidates.filter(c=>JSON.stringify(c.action)!==JSON.stringify(t.action)&&
    leader.qFromRoot-c.qFromRoot<=0.16).slice(0,2);
  if(!choices.length)continue;
  const before=[distance(t.state,0),distance(t.state,1)];
  const after=apply(t.state,t.action);
  rows.push({id:'n'+g.seed+'-'+g.match+'-'+g.sigma3Side+'-'+t.ply,
   split:g.split,sourceSeed:g.seed,match:g.match,originalResult:g.winner,rootWon:g.winner===t.side,
   side:t.side,ply:t.ply,gameHash:g.sequenceHash,stateKey:stateKey(t.state),
   state:t.state,action:t.action,actionNotation:notation(t.action),
   alternatives:choices.map(c=>({action:c.action,notation:notation(c.action),visits:c.visits,qFromRoot:c.qFromRoot})),
   rootVisits:leader.visits,chosenVsLeaderDisagreement:t.disagreement,
   pathBefore:before,pathAfter:[distance(after,0),distance(after,1)]});
 }
}
const stateSplit=new Map();
for(const r of rows){if(!stateSplit.has(r.stateKey))stateSplit.set(r.stateKey,new Set());stateSplit.get(r.stateKey).add(r.split);}
const conflicted=new Set([...stateSplit].filter(([k,v])=>v.size>1).map(([k])=>k));
const unique=new Set();
const candidates=rows.filter(r=>!conflicted.has(r.stateKey)&&!unique.has(r.stateKey)&&unique.add(r.stateKey));
const train=candidates.filter(r=>r.split==='train');
const holdout=candidates.filter(r=>r.split==='holdout');
const scoredTrain=train.filter(r=>!r.rootWon||r.chosenVsLeaderDisagreement).sort((a,b)=>{
 const score=r=>(!r.rootWon?3:0)+(r.chosenVsLeaderDisagreement?2:0)+(r.rootVisits>=20?1:0);
 return score(b)-score(a)||a.ply-b.ply;
});
const result={version:'sigma4-natural-mining-disjoint-v1',source:'evaluation/sigma4-natural-opening-games.json',
 trainSeeds:games.trainSeeds,holdoutSeeds:games.holdoutSeeds,
 summary:{games:games.games.length,rawCandidateRows:rows.length,splitConflictStates:conflicted.size,
 uniqueCandidateStates:candidates.length,trainStates:train.length,holdoutStates:holdout.length,
 trainLossStates:train.filter(r=>!r.rootWon).length,holdoutNotUsedForTraining:true},
 train:scoredTrain,holdout,
 warnings:['Overall game outcome is not action-quality ground truth','Same board state in train and holdout excluded from both','Opening trajectories are AI-generated without forced moves','Data includes exploratory policy and is not a deterministic Elo estimate']};
writeFileSync('evaluation/sigma4-natural-mined.json',JSON.stringify(result,null,2)+'\n');
console.log('NATURAL-MINED',JSON.stringify(result.summary), 'top',scoredTrain.slice(0,5).map(r=>({id:r.id,action:r.actionNotation,alternative:r.alternatives[0].notation})));
