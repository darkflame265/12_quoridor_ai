import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const get=p=>JSON.parse(readFileSync(p,'utf8'));
const loss=get('evaluation/sigma4-sigma3-loss-trajectory-audit-20261105.json');
const baseline=get('evaluation/sigma4-bitset200-vs-sigma23-20261105.json');
const v7pilot=get('evaluation/sigma4-tempo-v7-vs-sigma3-20261105.json');
const holdout=get('evaluation/sigma4-v3-v7-holdout-20261105.json');
const v8=get('evaluation/sigma4-v8-holdout-vs-sigma3-20261105.json');
assert.equal(loss.length,2);
assert.equal(v7pilot.games.length,4);
assert.equal(holdout.games.length,8);
assert.equal(v8.games.length,4);
const pairs=[];
for(const fixture of holdout.settings.fixtures){
 for(const candidateSide of [0,1]){
  const v3=holdout.games.find(g=>g.fixture===fixture.id&&g.candidateSide===candidateSide&&g.variant==='v3');
  const v7=holdout.games.find(g=>g.fixture===fixture.id&&g.candidateSide===candidateSide&&g.variant==='tempoV7');
  const v8game=v8.games.find(g=>g.fixture===fixture.id&&g.candidateSide===candidateSide);
  assert(v3&&v7&&v8game);
  assert.equal(v8game.hash,v3.hash,'V8 must match V3 in full game');
  assert.equal(v8game.candidateWon,v3.candidateWon);
  pairs.push({fixture:fixture.id,candidateSide,baselineWon:v3.candidateWon,v3Plies:v3.plies,v7Won:v7.candidateWon,v7Plies:v7.plies,v7Interventions:v7.tempoChanges??[],v7FullSequenceSame:v7.hash===v3.hash,v8Won:v8game.candidateWon,v8Plies:v8game.plies,v8FullSequenceSame:true,v8Escapes:v8game.tempoChanges??[]});
 }
}
const tally=variant=>({wins:pairs.filter(g=>g[variant+'Won']).length,losses:pairs.filter(g=>!g[variant+'Won']).length});
const sourceHashes=Object.fromEntries(['scripts/sigma4-tempo-guard-v7.mjs','scripts/sigma4-verified-two-turn-v8.mjs','scripts/sigma4-safe-original-v3.mjs'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const result={
 version:'sigma4-tactical-v7-v8-evidence-audit-v1',
 lossHistory:loss.map(g=>({fixture:g.fixture,side:g.seat,totalPlies:g.totalPlies,badWallCandidates:g.positions.filter(p=>p.action.type==='wall'&&p.after.enemy<=p.before.enemy&&p.before.own>p.before.enemy+3)})),
 trainingV7:{wins:v7pilot.games.filter(g=>g.candidateWon).length,losses:v7pilot.games.filter(g=>!g.candidateWon).length,
  caveat:'V7 includes the pre-existing V3 immediate-goal guard. Training results compared to original weighted selection cannot isolate tempo guard benefit.'},
 holdout:{pairs,baseline:tally('baseline'),v7:tally('v7'),v8:tally('v8'),
  v7InterventionGames:pairs.filter(x=>x.v7Interventions.length>0).length,
  v8Escapes:pairs.reduce((sum,x)=>sum+x.v8Escapes.length,0),
  v8FullyReplayed:pairs.every(x=>x.v8FullSequenceSame)},
 verifiedTwoTurnUnitCases:'No-wall opponent pawn two-turn goal proof, too-far pruning, and own immediate win',
 promotionGates:{v7ImprovedHoldoutWinRate:false,v7NoRegression:false,v8ImprovedHoldoutWinRate:false,v8FullGameNonRegression:true,strict500ms:false},
 productionPromotionApproved:false,
 decision:'Retain existing production default and research V3. V7 tempo-wall heuristic changed a losing match from 94 to 64 plies without any holdout win gain. V8 tactical proof did not trigger a corrective escape in four paired games; no strength improvement demonstrated.',
 sourceHashes
};
assert.deepEqual(result.holdout.baseline,{wins:2,losses:2});
assert.deepEqual(result.holdout.v7,{wins:2,losses:2});
assert.deepEqual(result.holdout.v8,{wins:2,losses:2});
assert.equal(result.holdout.v7InterventionGames,1);
assert.equal(result.holdout.v8Escapes,0);
writeFileSync('evaluation/sigma4-tactical-v7-v8-promotion-audit-20261105.json',JSON.stringify(result,null,2)+'\n');
console.log('PASS',JSON.stringify({baseline:result.holdout.baseline,v7:result.holdout.v7,v8:result.holdout.v8,interventionGames:result.holdout.v7InterventionGames,v8Escapes:result.holdout.v8Escapes,promotionApproved:false}));
