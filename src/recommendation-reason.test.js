import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,distance,validWall} from './engine.js';
import {recommendationReason as reason} from './recommendation-reason.js';
const full={review:true,budgetMs:Infinity};

test('forward move explains measured progress without claiming there are no useful walls',()=>{
 const s=initial(),r=reason(s,{type:'move',x:4,y:7});
 assert.match(r.summary,/1칸 줄이는 전진/);assert.doesNotMatch(r.summary,/없어|방어|가두/);
 assert.equal(r.effects.ownAfter,7);
});
test('wall explains both enemy delay and own detour, without guaranteeing arrival turns',()=>{
 const s=initial(),a={type:'wall',x:3,y:3,o:'h'},r=reason(s,a),next=apply(s,a);
 assert.equal(r.effects.enemyDelay,distance(next,1)-distance(s,1));
 assert.match(r.summary,/상대의 최단 경로를 1칸/);assert.match(r.summary,/나도 1칸/);
 assert.match(r.details.join(' '),/도착 턴 수는 아닙니다/);
 // Occupying the same blocking slot ourselves does not remove its damage.
 const edge={...s,p:[{x:0,y:8},{x:4,y:0}]};
 const reviewed=reason(edge,{type:'wall',x:0,y:3,o:'h'},full);assert.equal(reviewed.effects.ownChange,2);assert.equal(reviewed.defense,null);
});
test('a genuinely blocked opponent wall has a concrete, reproducible defense explanation',()=>{
 const s={p:[{x:4,y:5},{x:4,y:3}],walls:[{type:'wall',x:0,y:6,o:'h'},{type:'wall',x:3,y:1,o:'h'},{type:'wall',x:2,y:6,o:'h'},{type:'wall',x:1,y:1,o:'h'}],left:[8,8],turn:0,winner:null};
 const a={type:'wall',x:5,y:1,o:'v'},r=reason(s,a,full),attack=r.defense.wall;
 assert.equal(r.kind,'defense');assert.match(r.summary,/f8 가로벽 설치를 막아/);
 assert.ok(validWall({...s,turn:1},attack));assert.equal(validWall(apply(s,a),attack),false);
 assert.equal(r.defense.avoided,2);assert.match(r.details.join(' '),/실제로 그 벽을 선택한다는 뜻은 아닙니다/);
});
test('irrelevant wall and unsupported retreat are described honestly',()=>{
 assert.match(reason(initial(),{type:'wall',x:0,y:4,o:'h'}).summary,/늘리지 않는 벽/);
 const s={...initial(),p:[{x:4,y:4},{x:0,y:1}]};
 const r=reason(s,{type:'move',x:4,y:5});
 assert.equal(r.kind,'retreat');assert.match(r.summary,/방어 효과는 아직 확인되지/);
 assert.doesNotMatch(r.summary,/돌아 나가기 위한|가두/);
});
test('immediate wins and exposed opponent goals take priority over nicer sounding reasons',()=>{
 const s={...initial(),p:[{x:4,y:1},{x:0,y:7}]};
 assert.equal(reason(s,{type:'move',x:4,y:0},full).kind,'win');
 const r=reason({...s,p:[{x:4,y:4},{x:0,y:7}]},{type:'move',x:4,y:3},full);
 assert.equal(r.kind,'warning');assert.match(r.summary,/상대가 다음 이동으로 바로 도착/);
});
test('unfinished comparison never claims every wall is ineffective; input state stays intact',()=>{
 const s=initial(),before=structuredClone(s);let clock=0;
 const r=reason(s,{type:'move',x:4,y:7},{review:true,budgetMs:1,now:()=>clock+=2});
 assert.equal(r.comparison.complete,false);assert.doesNotMatch(r.summary,/없어|최대/);assert.deepEqual(s,before);
 assert.equal(reason(s,{type:'move',x:0,y:0}),null);
});
