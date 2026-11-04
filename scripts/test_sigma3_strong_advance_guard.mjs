import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{clone,apply,initial,legal,distance}from'../src/engine.js';
import{opponentResponseSearch,conservativeTacticalChoice}from'./sigma3-strong-advance-guard.mjs';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
for(const id of [101,103,105]){
 const r=roots.find(r=>r.id===id),s=clone(r.s);
 const before=JSON.stringify(s);
 for(const c of r.rootCandidates.slice(0,2)){
  const x=opponentResponseSearch(s,s.turn,c.action,{attackBeam:4,defenderBeam:3});
  assert.equal(x.rootAction,c.action);
  assert.ok(Number.isFinite(x.worstCase));
  assert.ok(x.examinedOpponentResponses>=1);
  for(const response of x.responses){
   const after=apply(s,c.action);
   assert.ok(legal(after,response.attack),'illegal attack '+id);
   if(response.reply){
    const next=apply(after,response.attack);
    assert.ok(legal(next,response.reply),'illegal defense '+id);
   }
  }
 }
 assert.equal(JSON.stringify(s),before,'must not modify root');
 const adapted=conservativeTacticalChoice(s,{
  pv:[r.rootCandidates[0].action],
  diagnostics:{rootChildren:r.rootCandidates}
 });
 assert.ok(legal(s,adapted.action));
}
const s=initial();s.p[0]={x:4,y:1};s.p[1]={x:7,y:8};
const best={type:'move',x:4,y:0},alt={type:'wall',x:0,y:0,o:'h'};
const r=conservativeTacticalChoice(s,{pv:[best],diagnostics:{
 rootChildren:[{action:best,visits:60,qFromRoot:.5},{action:alt,visits:50,qFromRoot:.45}]
}});
assert.deepEqual(r.action,best);assert.equal(r.changed,false);
assert.equal(r.reason,'winning-move-protected');
console.log('PASS tactical replies: legal attackers/defenders, preserved state, terminal winning moves protected');
