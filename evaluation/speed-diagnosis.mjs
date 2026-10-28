import {actionKey} from './native-diagnostics.mjs';
const complete=(r,depth)=>r?.depth>=depth||r?.exact===true||Math.abs(r?.score??0)>29000;
export function compareFixed(a,b,depth){
 const comparable=complete(a,depth)&&complete(b,depth);
 return {comparable,scoreDiffers:comparable&&a.score!==b.score,firstMoveDiffers:comparable&&actionKey(a.pv[0])!==actionKey(b.pv[0]),
  tiedAlternative:comparable&&a.score===b.score&&actionKey(a.pv[0])!==actionKey(b.pv[0])};
}
export function diagnoseSpeedCase(item){
 const s=item.searches;
 return {selective3:compareFixed(s.selective3,s.full3,3),selective4:compareFixed(s.selective4,s.full4,4),
  cores3:compareFixed(s.selective3,s.parallel3,3),
  timeActionChanges:actionKey(s.timed4.pv[0])!==actionKey(s.long4.pv[0]),
  threatOmissions:item.threats.filter(t=>t.sampled<t.independentGain).length,
  warning:'Fixed-depth full-width is a reference under the same heuristic, not a proof of the game outcome. Core and time differences alone do not prove an error.'};
}
