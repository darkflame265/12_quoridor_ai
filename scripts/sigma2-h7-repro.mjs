import {readFileSync,writeFileSync} from 'node:fs';
import {apply,legal,clone,distance,moves} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
const src=JSON.parse(readFileSync('evaluation/sigma2-h7-source.json','utf8'));
let s=clone(src.baseState);const history=[];
for (const a of src.records){if(!legal(s,a))throw Error('Illegal stored move '+JSON.stringify(a));history.push(clone(s));s=apply(s,a);}
const label=a=>a.type==='move'?'abcdefghi'[8-a.x]+(9-a.y):a;
console.log('position',JSON.stringify({p:s.p,turn:s.turn,left:s.left,dist:[distance(s,0),distance(s,1)]}));
console.log('moves',moves(s).map(a=>({action:label(a),after:distance(apply(s,a),s.turn)})));
const runs=[];
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
for(let i=0;i<4;i++){
 const client=new SigmaProcess({variant:'sigma2'});
 try{
  const t=await client.search({...s,historyStates:history.slice(-48)});
  const candidates=(t.diagnostics?.rootChildren??[]).map(c=>({action:label(c.action),visits:c.visits,q:c.qFromRoot,prior:c.prior}));
  console.log('run',i,'chosen',label(t.pv[0]),'root',candidates.slice(0,8),'debug',t.diagnostics?.loopDebug);
  runs.push({run:i,chosen:label(t.pv[0]),candidates,debug:t.diagnostics?.loopDebug});
 }finally{await client.close();}
}
writeFileSync('evaluation/sigma2-h7-repro.json',JSON.stringify({position:s,runs},null,2));