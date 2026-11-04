import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {apply,legal,notation,distance} from '../src/engine.js';
const file='evaluation/sigma4-natural-weighted-games.json';
if(!existsSync(file))throw Error('first run weighted natural games');
const report=JSON.parse(readFileSync(file,'utf8'));
const hashed=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stateKey=s=>hashed([s.p,s.walls.map(w=>[w.x,w.y,w.o]).sort(),s.left,s.turn]);
const raw=[];
for(const g of report.games){
 for(const t of g.trace){
  if(t.variant!=='sigma3'||!legal(t.state,t.action))continue;
  const children=(t.rootCandidates||[]).filter(c=>c.action&&legal(t.state,c.action)&&Number.isFinite(c.qFromRoot)&&c.visits>=5);
  if(children.length<2)continue;
  const lead=children[0],original=t.action;
  const alternatives=children.filter(c=>JSON.stringify(c.action)!==JSON.stringify(original)&&
   lead.qFromRoot-c.qFromRoot<=.15).slice(0,2);
  if(!alternatives.length)continue;
  const next=apply(t.state,original);
  raw.push({id:['w',g.seed,g.match,g.sigma3Side,t.ply].join('-'),
   split:g.split,sourceSeed:g.seed,match:g.match,side:t.side,ply:t.ply,
   stateKey:stateKey(t.state),gameHash:g.sequenceHash,rootState:t.state,originalAction:original,
   originalNotation:notation(original),chosenFromExploration:g.experimentalAgentCandidateSelection,
   gameWinner:g.winner,gameWonBySide:g.winner===t.side,
   rootChoices:children.slice(0,5),alternatives:alternatives.map(c=>({action:c.action,notation:notation(c.action),visits:c.visits,qFromRoot:c.qFromRoot})),
   before:[distance(t.state,0),distance(t.state,1)],after:[distance(next,0),distance(next,1)]});
 }
}
const splits=new Map();
for(const r of raw){if(!splits.has(r.stateKey))splits.set(r.stateKey,new Set());splits.get(r.stateKey).add(r.split);}
const conflicts=new Set([...splits].filter(([,v])=>v.size>1).map(([k])=>k));
const unique=new Set();
const clean=raw.filter(r=>!conflicts.has(r.stateKey)&&!unique.has(r.stateKey)&&unique.add(r.stateKey));
const train=clean.filter(r=>r.split==='train'),holdout=clean.filter(r=>r.split==='holdout');
const trainPrioritized=train.filter(r=>!r.gameWonBySide||r.rootChoices.some(c=>c.action&&JSON.stringify(c.action)!==JSON.stringify(r.originalAction))).sort((a,b)=>Number(!b.gameWonBySide)-Number(!a.gameWonBySide)||a.ply-b.ply);
const out={version:'sigma4-weighted-mining-grouped-holdout-v1',source:file,
 summary:{recordedGames:report.games.length,distinctSequences:new Set(report.games.map(g=>g.sequenceHash)).size,
 distinctFirstSix:new Set(report.games.map(g=>g.firstSixHash)).size,rawCandidateStates:raw.length,
 splitConflicts:conflicts.size,disjointStates:clean.length,trainStates:train.length,holdoutStates:holdout.length,
 trainingLossStates:train.filter(r=>!r.gameWonBySide).length},
 train:trainPrioritized,holdout,
 gates:{fullyRecorded:report.games.length===report.planned,allCompleted:report.games.every(g=>!g.cutoff),
  trainingAndHoldoutDisjoint:clean.every(r=>!conflicts.has(r.stateKey)),
  enoughIndependentVerifiedTrainingBranches:false,readyToTrain:false},
 caveats:['A game loss does not prove the selected move caused the loss','Root Q is an estimate, not a proven action value','Independent seeded games can still converge to identical positions','Held-out positions must never be used for tuning, root selection, or policy training']};
writeFileSync('evaluation/sigma4-weighted-mined.json',JSON.stringify(out,null,2)+'\n');
console.log('WEIGHTED-MINING',JSON.stringify(out.summary));
console.log('TOP',trainPrioritized.slice(0,4).map(r=>({id:r.id,ply:r.ply,from:r.originalNotation,to:r.alternatives[0]?.notation,won:r.gameWonBySide})));
