import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const file='evaluation/sigma4-safe-v3-matched-pilot-20261105.json';
const d=JSON.parse(readFileSync(file,'utf8'));
assert.equal(d.planned,d.games.length,'pilot incomplete');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hist=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8'));
const oldFixtures=new Set(hist.fixtures.map(f=>JSON.stringify(f.actions)));
const oldHoldout=JSON.parse(readFileSync('evaluation/sigma4-v2-holdout-fixtures.json','utf8'));
for(const f of d.settings.fixtures){
 assert.ok(!oldFixtures.has(JSON.stringify(f.actions)),'fixture overlaps historical training');
 assert.ok(!oldHoldout.fixtures.some(x=>JSON.stringify(x.actions)===JSON.stringify(f.actions)),'fixture overlaps prior holdout');
}
const group=[];
for(const opponent of d.settings.opponents){
 const old=[],safe=[],paired=[];
 for(const f of d.settings.fixtures)for(const seat of [0,1]){
  const matching=d.games.filter(g=>g.opponent===opponent&&g.fixture===f.id&&g.candidateSide===seat);
  assert.equal(matching.length,2,'variant pairing');
  const o=matching.find(g=>g.variant==='original'),v=matching.find(g=>g.variant==='safety-v3');
  assert.ok(o&&v);old.push(o);safe.push(v);
  paired.push({fixture:f.id,seat,originalWon:o.candidateWon,safetyWon:v.candidateWon,
   gain:!o.candidateWon&&v.candidateWon,regression:o.candidateWon&&!v.candidateWon,
   intervened:v.saved});
 }
 for(const g of [...old,...safe]){
  let state=initial();
  for(const a of g.moveSequence){assert.ok(legal(state,a),'illegal replay');state=apply(state,a);}
  assert.equal(state.winner,g.winner);assert.equal(g.plies,g.moveSequence.length);
  assert.equal(hash(g.moveSequence),g.fullHash);
  assert.equal(g.cutoff,g.winner===null);
  assert.equal(g.candidateWon,g.winner===g.candidateSide);
 }
 const summarize=rows=>({games:rows.length,wins:rows.filter(g=>g.candidateWon).length,
  losses:rows.filter(g=>!g.candidateWon&&!g.cutoff).length,
  cutoffs:rows.filter(g=>g.cutoff).length,
  uniqueGames:new Set(rows.map(g=>g.fullHash)).size,
  totalChanges:rows.reduce((n,g)=>n+g.changed,0),
  emergencyInterventions:rows.reduce((n,g)=>n+g.saved,0)});
 group.push({opponent,original:summarize(old),safety:summarize(safe),
  matched:{gains:paired.filter(p=>p.gain).length,regressions:paired.filter(p=>p.regression).length,
   ties:paired.filter(p=>p.originalWon===p.safetyWon).length},paired});
}
const criteria={allGamesEnd:group.every(g=>!g.original.cutoffs&&!g.safety.cutoffs),pairingsComplete:true,
 noTrainingFixtureLeakage:true,atLeast40IndependentFixtures:false,
 positivePairedImprovement:group.every(g=>g.matched.gains>g.matched.regressions),
 noRegression:group.every(g=>g.matched.regressions===0),productionPromotionApproved:false};
const report={version:'sigma4-safe-v3-matched-pilot-audit-v1',group,criteria,
 limitations:['Only two independently chosen new opening fixtures per opponent; cannot claim strength superiority.',
 'The tactical one-reply defense avoids specific immediate losses, not multi-ply forced defeats.',
 'This match is a screening pilot; untouched broader test positions are still required before promotion.'],
 next:['Generate diverse legal wall and midgame fixtures and reserve an untouched test split.',
  'Evaluate safety-v3 with paired opponent continuations at each observed intervention.',
  'Keep the original weighted algorithm as reference; only promote an independently verified candidate.']};
writeFileSync('evaluation/sigma4-safe-v3-matched-audit-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({group:group.map(({paired,...g})=>g),criteria},null,2));
