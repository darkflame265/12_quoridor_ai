import {legal} from '../game/engine.js';
import {boardKey} from '../capture/screen-sync.js';
const same=(a,b)=>a&&b&&a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
// Reuse a plan only when our actual move and the observed opponent reply match.
// It is an additional candidate for review, never an instruction to force a move.
export function defenseContinuation(state,records,past,log,engine){
 if(records.length<2||past.length<2)return null;
 const before=past.at(-2);if(before.turn!==state.turn)return null;
 const own=records.at(-2),opponent=records.at(-1),position=boardKey(before);
 const advice=log.findLast(e=>e.kind==='recommendation'&&e.position===position&&e.turn===state.turn&&e.engine===engine&&same(e.pv?.[0],own)&&same(e.threatDefense?.selected?.line?.attack,opponent));
 const reply=advice?.threatDefense?.selected?.line?.reply;
 return reply&&['move','wall'].includes(reply.type)&&legal(state,reply)?structuredClone(reply):null;
}
