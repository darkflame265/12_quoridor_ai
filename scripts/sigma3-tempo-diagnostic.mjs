import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{clone,apply,legal,distance,notation}from'../src/engine.js';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{conservativeTacticalChoice}from'./sigma3-response-search-experiment.mjs';
const sets=[
 ...JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8')),
 ...JSON.parse(readFileSync('evaluation/sigma3-active-middle-selected.json','utf8')),
 ...JSON.parse(readFileSync('evaluation/sigma3-independent-middle-fixtures.json','utf8'))
];
const ids=[27,103],fixtures=ids.map(id=>sets.find(x=>x.id===id));
if(fixtures.some(x=>!x))throw Error('missing fixture');
const tasks=fixtures.flatMap(f=>['base','tactical'].map(arm=>({id:f.id,arm})));
const path='evaluation/sigma3-tempo-diagnostic.json';
const report={version:'sigma3-tempo-diagnostic-v1',ids,
 sims:200,settings:{deterministic:true,exploration:0,search:'sigma3 vs sigma2',
 maxQGap:.15,maxQPenalty:.10,minimumVisits:15,minimumTacticalGain:.8,
 attackBeam:6,defenderBeam:4,wallRiskWeight:.35},
 totalGames:tasks.length,games:[]};
if(existsSync(path)){
 const old=JSON.parse(readFileSync(path,'utf8'));
 if(old.version!==report.version||old.totalGames!==report.totalGames)throw Error('resume version mismatch');
 report.games=old.games;
}
process.env.SIGMA_DIAGNOSTICS='1';process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';process.env.SIGMA2_REUSE='0';
process.env.SIGMA_SEED='20261104';
async function play(t){
 const f=fixtures.find(x=>x.id===t.id);
 let state=clone(f.s),history=(f.history||[]).slice(-48).map(clone),plies=0;
 let sigmaMoves=0,changed=0,eligible=0,elapsedTactics=0,baseElapsed=0,changes=[];
 const players=[new SigmaProcess({variant:f.s.turn===0?'sigma3':'sigma2'}),
                new SigmaProcess({variant:f.s.turn===1?'sigma3':'sigma2'})];
 try{
  while(state.winner===null&&plies<30){
   const side=state.turn,rootSide=f.s.turn;
   const result=await players[side].search({...state,historyStates:history.slice(-48)});
   baseElapsed+=result.elapsedMs||0;
   let chosen=result.pv?.[0];if(!chosen||!legal(state,chosen))throw Error('bad base '+t.id);
   if(side===rootSide){
    sigmaMoves++;
    if(t.arm==='tactical'){
     const trial=conservativeTacticalChoice(state,result,report.settings);
     eligible+=+(trial.reason!=='not-close-enough'&&trial.reason!=='no-root-diagnostics');
     elapsedTactics+=trial.elapsedMs||0;
     if(trial.changed){
      changed++;
      changes.push({ply:plies,baseline:notation(chosen),experimental:notation(trial.action),
       estimatedTacticalGain:trial.tacticalImprovement,
       elapsedMs:Math.round(trial.elapsedMs)});
      console.log('CHANGE DETAIL',t.id,plies,JSON.stringify({old:chosen,trial:trial.action,baselineDistances:[distance(state,0),distance(state,1)],newDistances:[distance(apply(state,trial.action),0),distance(apply(state,trial.action),1)],oldDistances:[distance(apply(state,chosen),0),distance(apply(state,chosen),1)],left:state.left,tacticalImprovement:trial.tacticalImprovement}));chosen=trial.action;
     }
    }
   }
   history.push(clone(state));
   state=apply(state,chosen);plies++;
  }
  const row={id:t.id,arm:t.arm,rootSide:f.s.turn,rootWon:state.winner===f.s.turn,
   rootLost:state.winner===1-f.s.turn,cutoff:state.winner===null,plies,
   sigmaMoves,changed,eligible,changes,
   averageBaseMs:baseElapsed/plies,extraTacticalMs:Math.round(elapsedTactics),
   finalDistances:[distance(state,0),distance(state,1)]};
  console.log('GAME',t.id,t.arm,'win',row.rootWon,'plies',plies,'changes',changed,
   'tacticMs',row.extraTacticalMs);
  return row;
 }finally{await Promise.all(players.map(p=>p.close()))}
}
for(let i=report.games.length;i<tasks.length;i+=2){
 const batch=await Promise.all(tasks.slice(i,i+2).map(play));
 report.games.push(...batch);
 writeFileSync(path,JSON.stringify(report,null,2));
 console.log('SAVED',report.games.length,'/',tasks.length);
}
const groups=ids.map(id=>{
 const rows=report.games.filter(x=>x.id===id);
 return {id,baseWon:rows[0].rootWon,tacticalWon:rows[1].rootWon,
  changes:rows[1].changed,cutoffs:rows.filter(x=>x.cutoff).length};
});
console.log('SUMMARY',JSON.stringify(groups));
