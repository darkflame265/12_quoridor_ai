import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,moves,distance} from '../src/engine.js';

const parse=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const jsonl=p=>readFileSync('evaluation/'+p,'utf8').trim().split('\n').map(JSON.parse);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const historicalFiles=['sigma4-value-development-positions-20261105.jsonl','sigma4-value-holdout-positions-20261105.jsonl'];
const past=new Set(historicalFiles.flatMap(name=>jsonl(name).map(x=>{
 const s=x.state;
 return sha({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
})));

const bank=jsonl('sigma4-unseen-wall-positions-20261105.jsonl');
const meta=parse('sigma4-unseen-wall-positions-manifest-20261105.json');
const deeper=parse('sigma4-unseen-wall-deep-20261105.json');
const review=parse('sigma4-unseen-wall-800-review-20261105.json');
const completed=parse('sigma4-unseen-wall-fullgame-20261105.json');
assert.equal(bank.length,48);
assert.equal(new Set(bank.map(x=>x.seed)).size,48);
assert.equal(bank.filter(x=>x.split==='holdout').length,12);
assert.equal(bank.filter(x=>x.split==='development').length,36);
const stateHash=s=>sha({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
const bankById=Object.fromEntries(bank.map(x=>[x.id,x]));
const bankIds=new Set();
for(const p of bank){
 let s=initial();
 for(const action of p.actions){
  assert(legal(s,action),'illegal synthetic prefix '+p.id);
  s=apply(s,action);
 }
 assert.equal(s.winner,null);
 assert.deepEqual(s,p.state);
 assert.equal(p.ply,p.actions.length);
 assert.equal(p.wallCount,s.walls.length);
 assert.equal(p.positionId,stateHash(s));
 assert(!past.has(p.positionId),'leak to prior evaluation');
 assert(!bankIds.has(p.positionId),'duplicate bank position');
 bankIds.add(p.positionId);
}
assert.equal(deeper.rows.length,48);
assert.equal(review.results.length,8);
const deepById=Object.fromEntries(deeper.rows.map(x=>[x.id,x]));
for(const row of deeper.rows){
 const p=bankById[row.id];
 assert(p&&row.positionId===p.positionId);
 assert.equal(row.split,p.split);
 assert.equal(row.search200.rootQ===null,false);
 assert.equal(row.search400.rootQ===null,false);
 assert(Number.isFinite(row.search200.rootQ)&&Number.isFinite(row.search400.rootQ));
 assert(legal(p.state,row.search200.action)&&legal(p.state,row.search400.action));
 assert(row.search200.workerMs>=0&&row.search400.workerMs>=0);
}
for(const row of review.results){
 assert.equal(bankById[row.id].split,'development');
 assert(Number.isFinite(row.q800));
 assert(legal(bankById[row.id].state,row.best800));
}
assert.equal(completed.games.length,16);
assert.equal(completed.summary.games,16);
const counts={development:0,holdout:0},validation=[];
const starts=new Set(completed.config.starts.map(x=>x.id));
assert.equal(starts.size,8);
for(const p of completed.config.starts){
 assert(bankById[p.id]);
 assert.equal(p.positionId,bankById[p.id].positionId);
 assert.equal(p.split,bankById[p.id].split);
}
const seen=new Set();
for(const game of completed.games){
 assert(starts.has(game.startId));
 const p=bankById[game.startId];
 const pairKey=game.startId+'/'+game.opponent;
 assert(!seen.has(pairKey));
 seen.add(pairKey);
 assert.equal(game.split,p.split);
 assert.equal(game.positionId,p.positionId);
 assert.equal(game.candidateSide,completed.config.starts.find(x=>x.id===p.id).side);
 assert(['sigma2','sigma3'].includes(game.opponent));
 assert(!game.cutoff,'full-game completion required');
 assert(game.winner===0||game.winner===1);
 assert(game.totalPlies===game.actions.length);
 assert.deepEqual(game.actions.slice(0,p.actions.length),p.actions);
 let state=initial();
 for(const action of game.actions){
  assert(legal(state,action),'invalid rollout move '+pairKey);
  state=apply(state,action);
 }
 assert.equal(state.winner,game.winner);
 assert.equal(sha(game.actions),game.fullMovesHash);
 assert.equal(game.candidateWon,game.winner===game.candidateSide);
 counts[game.split]++;
 // The bank position is always player-to-move 0, not necessarily the candidate side.
 const d=deepById[game.startId];
 const actual=game.winner===p.state.turn?1:0;
 const originalP=(d.modelValue+1)/2,searchP=(d.search400.rootQ+1)/2;
 validation.push({startId:game.startId,split:game.split,opponent:game.opponent,
  wallCount:p.wallCount,toMove:p.state.turn,candidateSeat:game.candidateSide,actualOutcome:actual,
  predictedOriginal:originalP,predicted400:searchP,
  originalSquared:(originalP-actual)**2,search400Squared:(searchP-actual)**2});
}
assert.equal(counts.development,8);
assert.equal(counts.holdout,8);
function summary(rows){
 if(!rows.length)return null;
 const brier=key=>rows.reduce((s,r)=>s+r[key],0)/rows.length;
 return {games:rows.length,uniqueStarts:new Set(rows.map(x=>x.startId)).size,
  observedCurrentMoverWinRate:brier('actualOutcome'),
  meanNetworkP:brier('predictedOriginal'),networkBrier:brier('originalSquared'),
  meanSearch400P:brier('predicted400'),search400Brier:brier('search400Squared')};
}
const byStart=Object.fromEntries([...starts].map(id=>{
 const rows=validation.filter(x=>x.startId===id);
 return [id,{split:bankById[id].split,wins:rows.map(r=>r.actualOutcome),
  contradictoryOutcome:rows[0].actualOutcome!==rows[1].actualOutcome,
  networkP:rows[0].predictedOriginal,search400P:rows[0].predicted400}];
}));
const contradictory=Object.entries(byStart).filter(([,v])=>v.contradictoryOutcome).map(([id])=>id);
const metric={version:'sigma4-unseen-wall-evidence-audit-v1',
 counts:{bankPositions:48,developmentPositions:36,holdoutPositions:12,
  fullGames:16,fullGameStartingPositions:8,developmentGames:8,holdoutGames:8,
  contradictionsAcrossOpponentPolicies:contradictory.length,contradictoryStarts:contradictory},
 rootStability:{...deeper.summary,review800:{positions:review.results.length,consistentWith400:review.summary.same400_800}},
 observedGameValue:{all:summary(validation),
 development:summary(validation.filter(r=>r.split==='development')),
 holdout:summary(validation.filter(r=>r.split==='holdout')),
 byStart},
 caveats:['Generated midgame trajectories are legal but not representative of optimal-policy self play',
  'Each two games from the same bank position share the same starting board and are dependent',
  '200,400 and 800 simulation search all use the SAME existing ONNX model; deeper search is not ground truth',
  'Opponent Sigma2 worker has previously existing user worktree changes',
  '16 completed games do not supply sufficiently reliable supervised value training labels',
  'This is an exploratory holdout evaluation, not proof of general win rate'],
 researchCandidates:review.results.filter(r=>bankById[r.id].split==='development')
  .map(r=>({id:r.id,networkValue:r.modelValue,rootQ400:r.q400,rootQ800:r.q800,split:'development'})),
 gates:{allMovesLegal:true,oldDatasetLeakage:false,differentSeeds:true,
  deeperSearchGroundTruth:false,calibratedModelTrainingApproved:false,productionPromotionApproved:false}};
writeFileSync('evaluation/sigma4-unseen-wall-evidence-audit-20261105.json',JSON.stringify(metric,null,2)+'\n');
console.log('PASS UNSEEN AUDIT',JSON.stringify({counts:metric.counts,rootStability:metric.rootStability.all,
 observations:metric.observedGameValue,productionPromotionApproved:false}));
