import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {openings,mazeOpenings} from '../evaluation/suite.js';
import {apply,legal} from '../src/engine.js';
import {Position} from '../src/search.js';
const previous=JSON.parse(await readFile('reports/fast-engine/native-match.json'));
const fixtures=[...openings('holdout',2),...mazeOpenings('holdout',2)],positions=[];
for(const game of previous.games.filter(g=>g.winner!==null&&g.winner!==g.nativeSide)){
 let state=structuredClone(fixtures.find(f=>f.id===game.fixture).state),records=[];
 for(const [ply,move] of game.moves.entries()){
  if(state.turn===game.nativeSide&&state.left[1-state.turn]>0){const p=new Position(state),sample=p.wallPotential(state.turn,4),full=p.wallPotential(state.turn,128);positions.push({game:game.fixture,side:game.nativeSide,ply,state:structuredClone(state),records:[...fixtures.find(f=>f.id===game.fixture).records,...records],played:move.action,sampled:sample,full,missedGain:full.gain-sample.gain});}
  if(!legal(state,move.action))throw Error('Invalid archived replay');state=apply(state,move.action);records.push(move.action);
 }
}
positions.sort((a,b)=>b.missedGain-a.missedGain||b.full.gain-a.full.gain);
const selected=positions.slice(0,12);await mkdir('reports/native51',{recursive:true});await mkdir('evaluation/fixtures',{recursive:true});
await writeFile('reports/native51/loss-review.json',JSON.stringify({source:'reports/fast-engine/native-match.json',warning:'Exposure diagnosis only; these are development fixtures, never a holdout.',reviewedPositions:positions.length,missedThreatPositions:positions.filter(p=>p.missedGain>0).length,positions:selected},null,2));
await writeFile('evaluation/fixtures/native-maze-regressions.json',JSON.stringify(selected.map((p,i)=>({id:`maze-exposure-${i}`,state:p.state,target:p.side,gain:p.full.gain,records:p.records})),null,2));
console.log(JSON.stringify({reviewed:positions.length,missed:positions.filter(p=>p.missedGain>0).length,examples:selected.map(p=>({game:p.game,ply:p.ply,before:p.sampled.gain,after:p.full.gain}))},null,2));
