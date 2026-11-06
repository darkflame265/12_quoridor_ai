import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal,distance,moves} from '../src/engine.js';
const d=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8'));
const summary=[],cases=[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
for(const g of d.games){
 const fixture=d.fixtures.find(x=>x.id===g.fixture);
 let state=initial(),changes=0,vetoes=0,downhill=0,winsBlocked=0,poorVisit=0;
 for(const a of fixture.actions)state=apply(state,a);
 for(const t of g.trace){
  if(!legal(state,t.action))throw Error('bad action in source');
  if(t.engine==='candidate'&&t.changed){
   const original=t.baseAction,chosen=t.action,root=t.rootChildren??[],lead=root[0],sample=root.find(c=>same(c.action,chosen));
   const nativeNext=apply(state,original),chosenNext=apply(state,chosen);
   const side=state.turn,other=1-side;
   const race=s=>distance(s,other)-distance(s,side);
   const raceDelta=race(chosenNext)-race(nativeNext);
   const qDrop=sample&&lead?lead.qFromRoot-sample.qFromRoot:null;
   const visitRatio=sample&&lead?sample.visits/Math.max(lead.visits,1):null;
   const opponentCanWin=s=>s.winner===null&&moves(s).some(a=>apply(s,a).winner===s.turn);
   const exposed=opponentCanWin(chosenNext)&&!opponentCanWin(nativeNext);
   const nearGoal=distance(state,other)<=3||distance(state,side)<=2;
   const tooFew=!sample||!lead||sample.visits<Math.max(10,lead.visits*.18);
   const tooLowQ=qDrop!==null&&qDrop>(chosen.type==='wall'?.035:.065);
   const tooMany=changes>=3;
   const veto=nearGoal||tooFew||tooLowQ||tooMany;
   if(veto)vetoes++;if(tooFew)poorVisit++;if(raceDelta<=-2)downhill++;if(exposed)winsBlocked++;
   cases.push({game:g.index,opponent:g.opponent,won:g.candidateWon,fixture:g.fixture,side,ply:t.ply,
    chosen,original,qDrop,visitRatio,raceDelta,exposedImmediateLoss:exposed,
    vetoReasons:[nearGoal&&'goal-race',tooFew&&'insufficient-visits',tooLowQ&&'q-risk',tooMany&&'override-budget'].filter(Boolean)});
   changes++;
  }
  state=apply(state,t.action);
 }
 summary.push({game:g.index,opponent:g.opponent,won:g.candidateWon,changes,vetoes,poorVisit,downhill,winsBlocked,plies:g.plies});
}
const groups=['sigma2','sigma3'].flatMap(opponent=>[true,false].map(won=>{
 const casesFor=cases.filter(x=>x.opponent===opponent&&x.won===won);
 const games=summary.filter(x=>x.opponent===opponent&&x.won===won);
 return {opponent,won,games:games.length,totalChanged:casesFor.length,
  meanChangesPerGame:casesFor.length/games.length,v2WouldFlag:casesFor.filter(x=>x.vetoReasons.length).length,
  raceRegressionAtLeast2:casesFor.filter(x=>x.raceDelta<=-2).length,
  exposesImmediateLoss:casesFor.filter(x=>x.exposedImmediateLoss).length,
  lowVisit:casesFor.filter(x=>x.vetoReasons.includes('insufficient-visits')).length,
  largeQDrop:casesFor.filter(x=>x.vetoReasons.includes('q-risk')).length};
}));
const out={version:'sigma4-weighted-original-decision-risk-audit-v1',groups,summary,
 worstCases:cases.filter(x=>x.exposedImmediateLoss||x.raceDelta<=-2).slice(0,25),
 limitations:['This is a retrospective association, not a counterfactual win proof',
 'A veto does not imply the alternative would win, and lower board distance is not always stronger',
 'Per-game v2 override budget assumes the historic path, not the trajectory after a v2 intervention']};
writeFileSync('evaluation/sigma4-original-weighted-loss-audit.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(groups,null,2));
