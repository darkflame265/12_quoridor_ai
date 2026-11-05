import{readFileSync,writeFileSync}from'node:fs';
import{initial,apply,clone}from'../src/engine.js';
import{SigmaProcess}from'./sigma4-isolated-process.mjs';
import{chooseWeightedResearchCandidate}from'./sigma4-weighted-research-choice.mjs';
import{chooseWeightedReplyV5}from'./sigma4-reply-search-v5.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const rng=n=>{n>>>=0;return{get seed(){return n},next(){n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296}}};
const positions=[];
for(const g of d.games.filter(g=>g.opponent==='sigma3'&&!g.candidateWon)){
 let s=initial(),h=[],r=rng(g.seed);
 for(const a of d.fixtures.find(f=>f.id===g.fixture).actions){h.push(clone(s));s=apply(s,a)}
 for(const t of g.trace){
  if(t.engine==='candidate'){
   const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}},seed=r.seed;
   const old=chooseWeightedResearchCandidate(s,search,()=>r.next(),d.settings.rootChoice);
   if(JSON.stringify(old.action)!==JSON.stringify(t.action))throw Error('replay mismatch');
   if(old.changed&&t.ply>=12&&t.ply<=38&&positions.length<3)
    positions.push({game:g.index,ply:t.ply,state:{...clone(s),historyStates:h.slice(-48)},search,seed});
  }
  h.push(clone(s));s=apply(s,t.action);
 }
}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const worker=new SigmaProcess({variant:'sigma3'}),out={scope:'historical loss training',positions:[]};
try{for(const p of positions){
 const r=rng(p.seed),choice=await chooseWeightedReplyV5(p.state,p.search,()=>r.next(),s=>worker.search({...s,historyStates:p.state.historyStates}),d.settings.rootChoice);
 out.positions.push({game:p.game,ply:p.ply,reason:choice.reason,gate:choice.replyGate,weighted:choice.weighted,native:choice.nativeResult,action:choice.action});
 writeFileSync('evaluation/sigma4-reply-v5-loss-audit.json',JSON.stringify(out,null,2)+'\n');
 console.log('AUDIT',p.game,p.ply,choice.reason,choice.weighted?.score,choice.nativeResult?.score);
}}finally{await worker.close()}
console.log('COMPLETE',out.positions.length);
