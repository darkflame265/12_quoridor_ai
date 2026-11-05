import assert from 'node:assert/strict';
import {initial,moves,legal,apply} from '../src/engine.js';
import {chooseSigma4MidgameReplyV9} from './sigma4-midgame-reply-v9.mjs';
const s=initial();
const [native,sample]=moves(s);
assert(legal(s,native)&&legal(s,sample));
const root={pv:[native],elapsedMs:90,diagnostics:{rootChildren:[
 {action:native,visits:80,qFromRoot:.24},
 {action:sample,visits:35,qFromRoot:.22}
]}};
const opts={ply:16,rate:1,minVisits:1,midgameRiskQ:0,midgameReplyMargin:-100};
let calls=0;
const reply=async state=>{calls++;const a=moves(state)[0];assert(legal(state,a));return {pv:[a]};};
const changed=await chooseSigma4MidgameReplyV9(s,root,()=>.99,reply,opts);
assert.equal(changed.replyV9,'rejected');
assert.deepEqual(changed.action,native);
assert.equal(calls,2);
const outside=await chooseSigma4MidgameReplyV9(s,root,()=>.99,reply,{...opts,ply:5});
assert.equal(outside.replyV9,'outside-midgame');
assert.equal(calls,2);
const cap=await chooseSigma4MidgameReplyV9(s,{...root,elapsedMs:900},()=>.99,reply,opts);
assert.equal(cap.replyV9,'root-over-budget');
assert.equal(calls,2);
const unavailable=await chooseSigma4MidgameReplyV9(s,root,()=>.99,async()=>{throw Error('unavailable');},opts);
assert.equal(unavailable.replyV9,'unavailable');
assert(legal(s,unavailable.action));
const safe=await chooseSigma4MidgameReplyV9(s,root,()=>.99,reply,{...opts,midgameReplyMargin:10000});
assert.equal(safe.replyV9,'accepted');
assert.deepEqual(safe.action,sample);
assert.equal(calls,4);
console.log('PASS V9 midgame conditional opponent reply checks',JSON.stringify({probes:calls,rejected:changed.action,accepted:safe.action}));
