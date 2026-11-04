import {clone,apply,distance,moves,validWall,legal} from '../src/engine.js';
import {directWallThreat} from './sigma3-wall-threat-probe.mjs';
const allWalls=[];
for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v'])
 allWalls.push({type:'wall',x,y,o});
function actions(state){
 const out=moves(state);
 if(state.left[state.turn]>0)for(const wall of allWalls)if(validWall(state,wall))out.push(wall);
 return out;
}
function staticScore(state,defender){
 if(state.winner!==null)return state.winner===defender?1000:-1000;
 const foe=1-defender;
 return distance(state,foe)-distance(state,defender)+
   .65*(state.left[defender]-state.left[foe]);
}
function bestDefenderReply(afterAttack,defender,{defenderBeam=4,wallRiskWeight=.35}={}){
 if(afterAttack.winner!==null){
  return {score:staticScore(afterAttack,defender),reply:null,
   afterReplyThreat:0,checked:0};
 }
 if(afterAttack.turn!==defender)throw Error('defender must move after opponent attack');
 const options=actions(afterAttack).map(action=>{
  const next=apply(afterAttack,action);
  return {action,next,rawScore:staticScore(next,defender)};
 });
 options.sort((a,b)=>b.rawScore-a.rawScore);
 let best=null;
 for(const item of options.slice(0,defenderBeam)){
  const threat=directWallThreat(item.next,defender,{topK:1});
  const score=item.rawScore-wallRiskWeight*threat.maxNetDamage;
  if(!best||score>best.score){
   best={reply:item.action,score,rawScore:item.rawScore,
    afterReplyThreat:threat.maxNetDamage,
    checked:Math.min(defenderBeam,options.length)};
  }
 }
 return best;
}
export function opponentResponseSearch(state,defender,rootAction,{
 attackBeam=6,defenderBeam=4,wallRiskWeight=.35,
 includeOpponentMoves=true
}={}){
 if(state.turn!==defender||!legal(state,rootAction))throw Error('illegal root move');
 if(!Number.isInteger(attackBeam)||attackBeam<1||
 !Number.isInteger(defenderBeam)||defenderBeam<1)throw Error('invalid beam settings');
 const afterRoot=apply(state,rootAction);
 const foe=1-defender;
 if(afterRoot.winner!==null)return {rootAction,worstCase:1000,terminal:true,responses:[],runtimeMs:0};
 let responses=[];
 const walls=directWallThreat(afterRoot,defender,{topK:Math.max(attackBeam*3,12)});
 responses.push(...walls.candidates.map(x=>x.action));
 if(includeOpponentMoves){
  const mm=moves(afterRoot).map(a=>({action:a,score:staticScore(apply(afterRoot,a),defender)}));
  mm.sort((a,b)=>a.score-b.score);
  responses.push(...mm.slice(0,2).map(x=>x.action));
 }
 if(!responses.length)responses=actions(afterRoot).slice(0,attackBeam);
 const seen=new Set();
 responses=responses.filter(a=>{const k=JSON.stringify(a);if(seen.has(k))return false;seen.add(k);return true;});
 // Order by immediate danger to defender; keep two pawn responses when available.
 const pawn=responses.filter(a=>a.type==='move').slice(0,2);
 const wall=responses.filter(a=>a.type==='wall').slice(0,Math.max(1,attackBeam-pawn.length));
 const attackChoices=[...wall,...pawn].slice(0,attackBeam);
 const scores=[];
 for(const attack of attackChoices){
  const afterAttack=apply(afterRoot,attack);
  const defense=bestDefenderReply(afterAttack,defender,{defenderBeam,wallRiskWeight});
  scores.push({attack,immediateMargin:staticScore(afterAttack,defender),
   ...defense});
 }
 scores.sort((a,b)=>a.score-b.score);
 return {rootAction,worstCase:scores[0]?.score??staticScore(afterRoot,defender),
  originalStatic:staticScore(afterRoot,defender),
  opponentOneWallRisk:walls.maxNetDamage,
  responses:scores,examinedOpponentResponses:scores.length,
  assumptions:'Ranked threat wall replies + pawn moves. Then legal defender responses; static BFS/wall-resource score with one additional immediate wall-risk probe. Beam-limited, not full minimax.'};
}
export function conservativeTacticalChoice(state,search,{
 maxQGap=.15,minimumVisits=18,minimumTacticalGain=1.5,
 maxQPenalty=.08,attackBeam=6,defenderBeam=4,
 wallRiskWeight=.35
}={}){
 const choice=search.pv?.[0];
 const ranked=search.diagnostics?.rootChildren||[];
 if(!choice||!legal(state,choice))throw Error('invalid base search');
 if(apply(state,choice).winner===state.turn)return {action:choice,changed:false,reason:'winning-move-protected'};
 const leader=ranked.find(x=>JSON.stringify(x.action)===JSON.stringify(choice))||ranked[0];
 if(!leader)return {action:choice,changed:false,reason:'no-root-diagnostics'};
 const alternatives=ranked.filter(x=>x.action&&legal(state,x.action)&&
  JSON.stringify(x.action)!==JSON.stringify(choice)&&
  x.visits>=minimumVisits&&
  leader.qFromRoot-x.qFromRoot<=maxQGap&&
  leader.qFromRoot-x.qFromRoot<=maxQPenalty).slice(0,2);
 if(!alternatives.length)return {action:choice,changed:false,reason:'not-close-enough'};
 const start=performance.now();
 const first=opponentResponseSearch(state,state.turn,choice,{attackBeam,defenderBeam,wallRiskWeight});
 const compared=alternatives.map(x=>({
  candidate:x,
  tactics:opponentResponseSearch(state,state.turn,x.action,{attackBeam,defenderBeam,wallRiskWeight})
 }));
 compared.sort((a,b)=>b.tactics.worstCase-a.tactics.worstCase);
 const winner=compared[0];
 const diff=winner.tactics.worstCase-first.worstCase;
 const changed=Boolean(winner&&diff>=minimumTacticalGain);
 return {action:changed?winner.candidate.action:choice,changed,
  tacticalImprovement:diff,baseCase:first.worstCase,
  alternativeCase:winner?.tactics.worstCase??null,
  examined:compared.length+1,
  elapsedMs:performance.now()-start,
  reason:changed?'tactical-advantage':'no-proven-tactical-advantage',
  details:{base:first,alternatives:compared}};
}
