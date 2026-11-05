import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const raw=read('evaluation/sigma2-sigma3-sigma4-direct-20261105.json');
const diverse=read('evaluation/sigma2-sigma3-sigma4-fixtures-20261105.json');
const comparisons=[
 ['sigma2','sigma3'],['sigma2','sigma4'],['sigma3','sigma4']
];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validate=(record,fixtures)=>{
 const result=new Set();
 for(const g of record.games){
  const fixture=fixtures.find(f=>f.name===g.fixture);
  assert.ok(!fixtures.length||fixture,'fixture missing');
  let s=initial(),actions=[];
  for(const a of fixture?.actions||[]){assert.ok(legal(s,a));actions.push(a);s=apply(s,a);}
  for(const t of g.trace){
   assert.equal(t.side,s.turn);assert.equal(t.ply,actions.length);
   assert.ok(legal(s,t.action??t.move),'illegal game action');
   actions.push(t.action??t.move);s=apply(s,t.action??t.move);
  }
  assert.equal(s.winner,g.winner);
  assert.equal(g.plies,actions.length);
  assert.equal(hash(actions),g.hash??g.sequenceHash);
  assert.equal(s.winner===null,g.cutoff);
  if(g.winnerEngine!==null)assert.equal(g.winnerEngine,g.winner===0?g.left:g.right);
  result.add(hash(actions));
 }
 return result.size;
};
const originalUnique=validate(raw,[]),diverseUnique=validate(diverse,diverse.settings.fixtures);
const summarize=(games)=>{
 return comparisons.map(([a,b])=>{
  const rows=games.filter(g=>g.a===a&&g.b===b);
  const firstWins=rows.filter(g=>g.winner===0).length,secondWins=rows.filter(g=>g.winner===1).length;
  const gamesWithResult=rows.filter(g=>!g.cutoff);
  return {a,b,games:rows.length,winsA:rows.filter(g=>g.winnerEngine===a).length,
   winsB:rows.filter(g=>g.winnerEngine===b).length,cutoff:rows.filter(g=>g.cutoff).length,
   firstWins,secondWins,
   uniqueSequences:new Set(rows.map(g=>g.hash??g.sequenceHash)).size,
   uniqueFirstSix:new Set(rows.map(g=>g.firstSixHash)).size,
   decisive:gamesWithResult.length};
 });
};
const past=read('reports/sigma-selfplay/sigma3-vs-sigma2-diverse-100.json');
const oldResults=past.results||[];
const report={version:'sigma234-current-head-to-head-audit-v1',
 currentInitial:summarize(raw.games),
 currentDiversified:summarize(diverse.games),
 currentCombined:summarize([...raw.games,...diverse.games]),
 oldSigma2vsSigma3:{games:oldResults.length,winsSigma2:oldResults.filter(g=>g.winnerVariant==='sigma2').length,winsSigma3:oldResults.filter(g=>g.winnerVariant==='sigma3').length,
  cutoffs:oldResults.filter(g=>g.cutoff).length,version:past.version},
 source:{raw:'evaluation/sigma2-sigma3-sigma4-direct-20261105.json',
 diversified:'evaluation/sigma2-sigma3-sigma4-fixtures-20261105.json',
 recentRawUnique:originalUnique,recentDiversifiedUnique:diverseUnique,
 sourceSHA256:{raw:hash(raw),diversified:hash(diverse)}},
 limitations:['Initial experiment used unchanged start position; changing a task seed alone did not diversify searches.','Diversified fixtures come from archived experimental opening games and are not unbiased random Quoridor openings.','Repeated full game sequences substantially reduce effective independent sample size.','All strength conclusions are provisional without larger independent seat-swapped fixtures.'],
 note:'Sigma4 is the deployed 3-ply selective minimax policy, not the older weighted-only research candidate.'};
writeFileSync('evaluation/sigma234-20261105-comparison-summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({initial:report.currentInitial,diversified:report.currentDiversified,combined:report.currentCombined,old:report.oldSigma2vsSigma3,
 unique:{initial:originalUnique,diversified:diverseUnique}},null,2));
