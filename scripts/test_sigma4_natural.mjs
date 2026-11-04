import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,moves,legal} from '../src/engine.js';
import {chooseResearchCandidate} from './sigma4-explore-root.mjs';
const s=initial(),list=moves(s);
assert.ok(list.length>=3);
const baseline=list[0],alternative=list[1],other=list[2];
const before=JSON.stringify(s);
const search={pv:[baseline],diagnostics:{rootChildren:[
 {action:baseline,visits:100,qFromRoot:0.50},
 {action:alternative,visits:30,qFromRoot:0.46},
 {action:other,visits:20,qFromRoot:0.43}
]}};
const random=()=>0;
const chosen=chooseResearchCandidate(s,search,random,{rate:1});
assert.ok(chosen.changed);
assert.deepEqual(chosen.action,alternative);
assert.ok(legal(s,chosen.action));
const unchanged=chooseResearchCandidate(s,search,random,{rate:0});
assert.equal(unchanged.changed,false);
assert.deepEqual(unchanged.action,baseline);
const bad=chooseResearchCandidate(s,{pv:[baseline],diagnostics:{rootChildren:[{action:baseline,visits:100,qFromRoot:.50},{action:alternative,visits:30,qFromRoot:-.50}]}},random,{rate:1});
assert.equal(bad.changed,false);
assert.equal(JSON.stringify(s),before);
const native=JSON.parse(readFileSync('evaluation/sigma4-natural-opening-games.json'));
const experimental=JSON.parse(readFileSync('evaluation/sigma4-natural-exploratory-games.json'));
const mined=JSON.parse(readFileSync('evaluation/sigma4-natural-mined.json'));
const audit=JSON.parse(readFileSync('evaluation/sigma4-natural-audit.json'));
assert.equal(native.games.length,9);
assert.equal(experimental.games.length,6);
assert.equal(new Set(native.games.map(g=>g.sequenceHash)).size,1);
assert.equal(new Set(experimental.games.map(g=>g.sequenceHash)).size,5);
assert.equal(mined.summary.trainStates,0);
assert.equal(mined.summary.holdoutStates,0);
assert.equal(audit.promote,false);
assert.equal(audit.experimentalOverrides,57);
console.log('PASS SIGMA4 natural: root selection, data provenance, 9 repeated games, 6 exploratory games, no leakage/promotion');
