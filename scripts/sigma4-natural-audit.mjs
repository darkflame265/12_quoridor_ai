import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const sets=[['evaluation/sigma4-natural-opening-games.json','native'],['evaluation/sigma4-natural-exploratory-games.json','experimental']];
const rows=[];
for(const [file,type] of sets){
 if(!existsSync(file))continue;
 const d=JSON.parse(readFileSync(file));
 for(const g of d.games){
  let state=initial();assert.equal(g.openingPrefix.length,0);
  const snap=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
  for(let i=0;i<g.trace.length;i++){
   const t=g.trace[i];assert.equal(t.ply,i);assert.equal(snap(state),snap(t.state));assert.ok(legal(state,t.action));state=apply(state,t.action);
  }
  assert.equal(state.winner,g.winner);
  rows.push({type,seed:g.seed,split:g.split,match:g.match,side:g.sigma3Side,winner:g.winner,cutoff:g.cutoff,hash:g.sequenceHash,openingHash:g.firstSixHash,overrides:g.overrides||0});
 }
}
const unique=(array,field)=>new Set(array.map(g=>g[field])).size;
const native=rows.filter(g=>g.type==='native'),experimental=rows.filter(g=>g.type==='experimental');
const report={version:'sigma4-natural-audit-v1',games:rows.length,nativeGames:native.length,experimentalGames:experimental.length,nativeUniqueSequences:unique(native,'hash'),nativeUniqueFirstSix:unique(native,'openingHash'),experimentalUniqueSequences:unique(experimental,'hash'),experimentalUniqueFirstSix:unique(experimental,'openingHash'),experimentalOverrides:experimental.reduce((n,g)=>n+g.overrides,0),rows,
 gates:{allFinished:rows.every(g=>!g.cutoff),naturalOpeningNovelty:unique(native,'openingHash')>=3,independentGames:unique(native,'hash')>=10,verifiedTrainingLabels:false},promote:false};
writeFileSync('evaluation/sigma4-natural-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games:report.games,native:report.nativeGames,nativeUnique:report.nativeUniqueSequences,nativeFirstSix:report.nativeUniqueFirstSix,experimental:report.experimentalGames,experimentalUnique:report.experimentalUniqueSequences,experimentalOverrides:report.experimentalOverrides,gates:report.gates}));
