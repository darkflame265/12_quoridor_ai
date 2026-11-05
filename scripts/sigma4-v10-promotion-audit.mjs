import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const filename='evaluation/sigma4-v10-independent-sigma23-20261105.json';
const data=JSON.parse(readFileSync(filename,'utf8'));
const n=data.settings.fixtures.length*data.settings.opponents.length*2*data.settings.variants.length;
assert.equal(n,48);
assert.equal(data.games.length,n,'incomplete tournament');
assert.equal(data.settings.fixtures.length,6);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fullComparisons=[];
const opponents={};
const timings={};
const rootFlags={};
for(const game of data.games){
 assert(game.seed&&game.actions.length>=6);
 let state=initial();
 for(let i=0;i<game.actions.length;i++){
  assert(legal(state,game.actions[i]),'invalid move in '+game.fixture+' ply '+i);
  state=apply(state,game.actions[i]);
 }
 assert.equal(state.winner,game.winner);
 assert.equal(game.candidateWon,state.winner===game.candidateSide);
 assert.equal(game.cutoff,state.winner===null);
 assert.equal(game.hash,hash(game.actions));
 const op=game.opponent,variant=game.variant;
 if(!opponents[op])opponents[op]={};
 if(!opponents[op][variant])opponents[op][variant]={wins:0,losses:0,draws:0,games:0};
 const r=opponents[op][variant];
 r.games++;
 if(game.cutoff)r.draws++;else if(game.candidateWon)r.wins++;else r.losses++;
 if(!timings[variant])timings[variant]=[];
 timings[variant].push(...game.timingsMs);
 if(variant==='v10')for(const [key,n] of Object.entries(game.v10Statuses??{}))rootFlags[key]=(rootFlags[key]??0)+n;
}
for(const op of data.settings.opponents)for(const f of data.settings.fixtures)for(const side of [0,1]){
 const rows=data.games.filter(g=>g.opponent===op&&g.fixture===f.id&&g.candidateSide===side);
 assert.equal(rows.length,2);
 const v3=rows.find(g=>g.variant==='v3'),v10=rows.find(g=>g.variant==='v10');
 assert(v3&&v10);
 assert.equal(v3.seed,v10.seed);
 assert.deepEqual(v3.actions.slice(0,f.actions.length),f.actions);
 assert.deepEqual(v10.actions.slice(0,f.actions.length),f.actions);
 fullComparisons.push({opponent:op,fixture:f.id,seat:side,
  v3Won:v3.candidateWon,v10Won:v10.candidateWon,
  v3Plies:v3.plies,v10Plies:v10.plies,
  allActionsSame:v3.hash===v10.hash,v10Overrides:v10.v10Interventions.length,
  improved:!v3.candidateWon&&v10.candidateWon,regressed:v3.candidateWon&&!v10.candidateWon});
}
const pct=(values,p)=>{const arr=[...values].sort((a,b)=>a-b);return arr[Math.ceil(arr.length*p)-1];};
const timing=Object.fromEntries(Object.entries(timings).map(([k,a])=>[k,{
 count:a.length,meanMs:a.reduce((p,v)=>p+v,0)/a.length,p95Ms:pct(a,.95),p99Ms:pct(a,.99),maxMs:Math.max(...a),
 over500:a.filter(x=>x>500).length}]));
const improvements=fullComparisons.filter(x=>x.improved).length;
const regressions=fullComparisons.filter(x=>x.regressed).length;
const report={version:'sigma4-wall-structure-v10-independent-evidence-audit-v1',games:n,fixtureCount:6,pairedComparisons:fullComparisons.length,
 opponents,timing,wallPolicyStatuses:rootFlags,pairedComparisonsResults:fullComparisons,
 improvements,regressions,
 gates:{legalReplay:true,sixIndependentStartFixtures:true,sameSeatAndSeed:true,
  demonstratedWinImprovement:improvements>regressions,strict500Ms:timing.v10.over500===0,productionPromotionApproved:false},
 decision:'Research-only. A 48-game, 6-opening pilot is not enough to establish a general strength advantage, and Wall-structure root tie breaker retains 200-sim root but does not guarantee 500ms.'
};
assert.equal(fullComparisons.length,24);
writeFileSync('evaluation/sigma4-v10-promotion-audit-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('AUDIT',JSON.stringify({opponents,improvements,regressions,rootFlags,timing,promotionApproved:false}));
