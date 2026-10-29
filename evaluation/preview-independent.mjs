import {initial,legal,apply,moves,distance} from '../src/engine.js';
import {rotate} from './suite.js';
import {wallContact} from './wall-geometry.mjs';
import {makeBookReplay} from './strategy-book.mjs';
export const study={version:'pressure-independent76-v1',seed:76261029,familiesPerSuite:3,budgets:[40000,50000,60000],depths:[3,4],deepDepth:5,deepFamilyIndex:0,ms:500,cores:4,rounds:3,referenceMs:30000,
 criteria:{minimumImprovedFamilies:2,allowSuiteGapRegression:false,allowFixedDepth5GapRegression:false,maximumDepthRegressionsPerBudget:2,maximumTimedOverruns:1,timedOverrunMs:605},
 decision:'Research gate only; frozen pressure candidate. No promotion without separate arena and holdout. Previous 50k failure remains recorded.'};
export function geometryKey(s){
 const variants=[s.walls,s.walls.map(w=>({...w,x:7-w.x})),s.walls.map(w=>({...w,x:7-w.x,y:7-w.y})),s.walls.map(w=>({...w,y:7-w.y}))];
 return variants.map(ws=>ws.map(w=>`${w.o}:${w.x}:${w.y}`).sort().join('|')).sort()[0];
}
export function archiveGeometries(data,out){
 if(!data||typeof data!=='object')return;
 if(Array.isArray(data.walls)&&Array.isArray(data.p)&&data.p.length===2&&data.walls.every(w=>w&&['h','v'].includes(w.o)&&Number.isInteger(w.x)&&Number.isInteger(w.y)&&w.x>=0&&w.x<8&&w.y>=0&&w.y<8))out.add(geometryKey(data));
 if(Array.isArray(data.records)){
  const walls=[];out.add('');for(const a of data.records)if(a?.type==='wall'&&['h','v'].includes(a.o)&&Number.isInteger(a.x)&&Number.isInteger(a.y)&&a.x>=0&&a.x<8&&a.y>=0&&a.y<8){walls.push(a);out.add(geometryKey({walls}));}
 }
 for(const value of Object.values(data))if(value&&typeof value==='object')archiveGeometries(value,out);
}
export function largestCluster(walls){
 let best=0;const used=new Set();for(let i=0;i<walls.length;i++)if(!used.has(i)){const q=[i];used.add(i);for(let head=0;head<q.length;head++)for(let j=0;j<walls.length;j++)if(!used.has(j)&&wallContact(walls[q[head]],walls[j])){used.add(j);q.push(j);}best=Math.max(best,q.length);}return best;
}
export function independentCases(excluded){
 let seed=study.seed;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const cases=[],used=new Set(excluded);
 for(const suite of ['general','maze'])for(let family=0;family<study.familiesPerSuite;family++){
  let accepted=false;
  for(let attempt=0;attempt<5000&&!accepted;attempt++){
   let state=initial();const records=[],walls=(suite==='general'?4:8)+family;
   for(let i=0;i<walls;i++){
    let choices=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',o,x,y};if(legal(state,a))choices.push(a);}
    if(suite==='maze'&&state.walls.length&&rand()%4!==0){const attached=choices.filter(a=>state.walls.some(w=>wallContact(a,w)));if(attached.length)choices=attached;}
    if(!choices.length)break;const a=choices[rand()%choices.length];records.push(a);state=apply(state,a);
   }
   if(state.walls.length!==walls)continue;
   for(let i=0,n=8+2*(attempt%3);i<n;i++){
    const all=moves(state).filter(a=>a.y!==(state.turn===0?0:8));if(!all.length)break;
    const old=distance(state,state.turn),forward=all.filter(a=>distance(apply(state,a),state.turn)<old),choices=rand()%4!==0&&forward.length?forward:all;
    const a=choices[rand()%choices.length];records.push(a);state=apply(state,a);
   }
   const ds=[distance(state,0),distance(state,1)],cluster=largestCluster(state.walls),key=geometryKey(state);
   if(state.winner!==null||ds.some(d=>d<3||d>30)||used.has(key)||suite==='general'&&cluster>2||suite==='maze'&&(cluster<3||ds[0]+ds[1]<14))continue;
   const paired=rotate(state);let replay;
   try{replay=makeBookReplay(paired);}catch{continue;}
   const id=`${suite}-${family}`,metadata={suite,familyId:id,familyIndex:family,geometry:key,distances:ds,cluster};
   cases.push({...metadata,id:`${id}-normal`,flipped:false,state,records},{...metadata,id:`${id}-rotated`,flipped:true,state:paired,distances:[...ds].reverse(),records:replay.records});
   used.add(key);accepted=true;
  }
  if(!accepted)throw Error(`Unable to generate independent ${suite} family ${family}`);
 }return cases;
}
export const logical=r=>({depth:r.depth,score:r.score,nodes:r.nodes,pv:r.pv});
export function assessIndependent(rows){
 const suites=['general','maze'];const complete=rows.length===12&&new Set(rows.map(r=>r.id)).size===12&&suites.every(s=>{const group=rows.filter(r=>r.suite===s),families=[...new Set(group.map(r=>r.familyId))];return group.length===6&&families.length===3&&families.every(f=>[false,true].every(flipped=>group.filter(r=>r.familyId===f&&r.flipped===flipped).length===1));});
 const validGap=v=>v&&['off','pressure'].every(role=>Number.isFinite(v[role]));
 const comparable=complete&&rows.every(r=>r.integrity&&validGap(r.fixedGaps?.[4])&&study.budgets.every(n=>validGap(r.budgetGaps?.[n])&&r.budgets?.[n]?.off&&r.budgets?.[n]?.pressure)&&r.timed.every(v=>Number.isFinite(v.gap))&&r.timed.length===6&&(!r.deepRequired||validGap(r.fixedGaps?.[5])));
 if(!comparable)return {eligibleForArena:false,checks:{complete,comparable},reason:'Incomplete integrity/reference/measurement evidence'};
 const sum=(list,fn)=>list.reduce((n,r)=>n+fn(r),0);
 const fixedImproved=new Set(rows.filter(r=>r.fixedGaps[4].pressure<r.fixedGaps[4].off).map(r=>r.familyId)).size;
 const curve=Object.fromEntries(study.budgets.map(n=>[n,{improvedFamilies:new Set(rows.filter(r=>r.budgetGaps[n].pressure<r.budgetGaps[n].off).map(r=>r.familyId)).size,depthRegressions:rows.filter(r=>r.budgets[n].pressure.result.depth<r.budgets[n].off.result.depth&&Math.abs(r.budgets[n].pressure.result.score)<29500).length,suiteNoRegression:suites.every(s=>{const list=rows.filter(r=>r.suite===s);return sum(list,r=>r.budgetGaps[n].pressure)<=sum(list,r=>r.budgetGaps[n].off);})}]));
 const timed=Object.fromEntries(suites.map(s=>{const runs=rows.filter(r=>r.suite===s).flatMap(r=>r.timed);return [s,Object.fromEntries(['original','pressure'].map(role=>{const list=runs.filter(v=>v.role===role);return [role,{gapSum:sum(list,v=>v.gap),inferior:list.filter(v=>v.gap>0).length,depthSum:sum(list,v=>v.result.depth),overruns:list.filter(v=>v.result.elapsedMs>study.criteria.timedOverrunMs).length}];}))];}));
 const checks={complete,comparable,fixed3Parity:rows.every(r=>r.fixed3Parity),fixed4ImprovesDifferentFamilies:fixedImproved>=study.criteria.minimumImprovedFamilies,fixed4SuiteNoRegression:suites.every(s=>{const list=rows.filter(r=>r.suite===s);return sum(list,r=>r.fixedGaps[4].pressure)<=sum(list,r=>r.fixedGaps[4].off);}),deep5NoRegression:rows.filter(r=>r.deepRequired).every(r=>r.fixedGaps[5].pressure<=r.fixedGaps[5].off),curveNoRegression:Object.values(curve).every(v=>v.suiteNoRegression&&v.depthRegressions<=study.criteria.maximumDepthRegressionsPerBudget),curveImprovesDifferentFamilies:Object.values(curve).some(v=>v.improvedFamilies>=study.criteria.minimumImprovedFamilies),timedSuiteNoRegression:suites.every(s=>timed[s].pressure.gapSum<=timed[s].original.gapSum&&timed[s].pressure.depthSum>=timed[s].original.depthSum),timedDeadlines:suites.reduce((n,s)=>n+timed[s].pressure.overruns,0)<=study.criteria.maximumTimedOverruns};
 return {eligibleForArena:Object.values(checks).every(Boolean),checks,fixedImprovedFamilies:fixedImproved,curve,timed,productionChanged:false};
}
