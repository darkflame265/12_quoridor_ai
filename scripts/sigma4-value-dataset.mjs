import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,distance} from '../src/engine.js';

const files=[
 'evaluation/sigma4-v10-independent-sigma23-20261105.json',
 'evaluation/sigma4-v9-independent-sigma23-20261105.json',
 'evaluation/sigma4-bitset200-vs-sigma23-20261105.json'
];
const hash=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const keepPlies=new Set([6,8,12,16,20,24,30,36,42,48,54,60,66,72,78,84,90,100,110,120]);
const games=[],fixtureMap=new Map();
for(const file of files){
 const data=JSON.parse(readFileSync(file,'utf8'));
 for(const fx of data.settings.fixtures){
  const key=hash(fx.actions);
  if(!fixtureMap.has(key))fixtureMap.set(key,{id:fx.id,actions:fx.actions,hash:key});
 }
 for(const [idx,g] of data.games.entries()){
  assert(!g.cutoff&&g.winner!==null,'nonterminal game excluded: '+file);
  const fixture=data.settings.fixtures.find(f=>f.id===g.fixture);
  assert(fixture);
  const fixtureHash=hash(fixture.actions);
  let s=initial(); const values=[];
  for(let ply=0;ply<g.actions.length;ply++){
   assert(legal(s,g.actions[ply]),'illegal move '+file+' '+idx+' '+ply);
   if(keepPlies.has(ply)&&ply>=fixture.actions.length&&g.actions.length-ply>=3){
    const state=clone(s);
    const stateHash=hash({p:state.p,walls:[...state.walls].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:state.left,turn:state.turn});
    values.push({source:file,fixture:g.fixture,fixtureHash,sourceGame:idx,positionId:stateHash,
     ply,remaining:g.actions.length-ply,gameWinner:g.winner,toMove:s.turn,actualValue:g.winner===s.turn?1:-1,
     ownDistance:distance(s,s.turn),enemyDistance:distance(s,1-s.turn),
     state:{p:state.p,walls:state.walls,left:state.left,turn:state.turn}});
   }
   s=apply(s,g.actions[ply]);
  }
  assert.equal(s.winner,g.winner);
  games.push({file,index:idx,fixtureHash,fixture:g.fixture,plies:g.actions.length,win:g.winner,positions:values});
 }
}
const groups=[...fixtureMap.values()].sort((a,b)=>a.hash.localeCompare(b.hash));
assert(groups.length>=9,'need several distinct fixture groups');
for(const [i,g] of groups.entries())g.split=i%4===0?'holdout':'development';
const splitByHash=Object.fromEntries(groups.map(g=>[g.hash,g.split]));
const dedup=new Map(),bySplit={development:[],holdout:[]};
let duplicated=0,conflict=0,crossSplit=0;
for(const game of games){
 for(const row of game.positions){
  const split=splitByHash[row.fixtureHash];
  const key=row.positionId;
  if(dedup.has(key)){
   const prior=dedup.get(key);
   duplicated++;
   if(prior.split!==split)crossSplit++;
   if(prior.row.actualValue!==row.actualValue){conflict++;prior.conflicting=true;}
   // If a position occurs across split groups, quarantine it from both.
   if(prior.split!==split)prior.quarantine=true;
  }else dedup.set(key,{row,split,quarantine:false,conflicting:false});
 }
}
for(const item of dedup.values()){
 if(!item.quarantine&&!item.conflicting)bySplit[item.split].push(item.row);
}
assert(bySplit.holdout.length>=30&&bySplit.development.length>=100);
const manifest={
 version:'sigma4-value-calibration-dataset-v1',
 label:'Observed final outcome from current player perspective; NOT minimax or proven winning value',
 sourceFiles:files, sourceGames:games.length,fixtureGroups:groups.map(({id,hash,split})=>({id,hash,split})),
 overlap:{rawPositionSamples:games.reduce((n,g)=>n+g.positions.length,0),duplicated,conflictingObservedLabels:conflict,crossSplitObserved:crossSplit,quarantinedCrossSplit:[...dedup.values()].filter(x=>x.quarantine).length,excludedAmbiguousPositions:[...dedup.values()].filter(x=>x.conflicting).length},
 splits:Object.fromEntries(Object.entries(bySplit).map(([k,v])=>[k,{positions:v.length,positive:v.filter(x=>x.actualValue===1).length,negative:v.filter(x=>x.actualValue===-1).length}])),
 holdoutLeakagePrevented:true,ambiguousOutcomeExcluded:true,
 seed:20261105,
 modelPath:'vendor/sigma-quoridor/models/best.onnx'
};
for(const split of ['development','holdout'])
 writeFileSync('evaluation/sigma4-value-'+split+'-positions-20261105.jsonl',bySplit[split].map(row=>JSON.stringify(row)).join('\n')+'\n');
writeFileSync('evaluation/sigma4-value-dataset-manifest-20261105.json',JSON.stringify(manifest,null,2)+'\n');
console.log('PASS dataset',JSON.stringify(manifest));
