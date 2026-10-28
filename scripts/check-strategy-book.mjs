import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {bookCases,makeBookReplay,wallEffect,actionKey} from '../evaluation/strategy-book.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {activeNativeProfile,nativeSourceHash,digest} from '../evaluation/native-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';

const out=process.argv[2];if(!out)throw Error('Specify a new report directory');
await mkdir(out,{recursive:false});await mkdir(path.join(out,'replays'));
if(activeNativeProfile()!=='candidate')throw Error('Approved Atlas 5.3 unavailable');
const bound=['evaluation/strategy-book.mjs','scripts/check-strategy-book.mjs','src/engine.js','src/search.js','src/spectator.js','evaluation/suite.js'];
async function identity(){return {nativeSourceHash:nativeSourceHash(),nativeBinarySha256:digest(await readFile(nativeExecutable)),branchBuild:verifyRootGuardBuild(),branchBinarySha256:digest(await readFile(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'))),filesEncoding:'utf8-lf',files:Object.fromEntries(await Promise.all(bound.map(async f=>[f,digest((await readFile(f,'utf8')).replaceAll('\r\n','\n'))])))};}
const startIdentity=await identity(),rows=[];
async function search(state,ms){
 const client=new NativeProcess({profile:'candidate'});
 try{await client.health();const r=await client.search(state,{ms,cores:4});let p=state;
  if(!r.pv?.length)throw Error('Missing PV');for(const a of r.pv){if(!legal(p,a))throw Error('Illegal native PV');p=apply(p,a);}
  return {...r,budgetMs:ms,cores:4};
 }finally{client.close();}
}
for(const c of bookCases()){
 const replay=makeBookReplay(c.state),file=`replays/${c.id.replaceAll('/','-')}.json`;
 await writeFile(path.join(out,file),JSON.stringify({...replay,bookCase:c.id,assumptions:c.assumptions},null,2)+'\n');
 const fast=await search(c.state,500),long=c.assumptions.stock==='balanced'?await search(c.state,2000):null;
 const effects=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const action={type:'wall',o,x,y},effect=wallEffect(c.state,action);if(effect)effects.push({action,...effect});
 }
 rows.push({...c,replay:file,replaySha256:digest(await readFile(path.join(out,file))),effects,searches:{fast,long},comparedEffects:c.compare.map(action=>({action,...wallEffect(c.state,action)}))});
 console.log(`${c.id}: ${actionKey(fast.pv[0])}, depth ${fast.depth}`);
}
// Independent full-width branch values retain the root's ply and repetition
// context. Only this explicit comparison set is ranked, not all legal actions.
const inputs=rows.map(r=>({state:r.state,depth:3,actions:[...new Set([...r.compare,r.searches.fast.pv[0],...(r.searches.long?[r.searches.long.pv[0]]:[])].map(encode))]}));
const audited=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
if(audited.status!==0)throw Error(audited.stderr||'Branch audit failed');
const branches=JSON.parse(audited.stdout);if(branches.length!==rows.length)throw Error('Branch count mismatch');
for(let i=0;i<rows.length;i++){
 const row=rows[i],reference=branches[i],best=Math.max(...reference.actions.map(a=>a.score));row.branchReference=reference;
 for(const r of Object.values(row.searches).filter(Boolean)){
  const value=reference.actions.find(a=>a.action===encode(r.pv[0]));if(!value)throw Error('Missing selected branch');
  r.comparisonGap=best-value.score;r.bookMove=row.compare.some(a=>actionKey(a)===actionKey(r.pv[0]));
 }
}
if(JSON.stringify(await identity())!==JSON.stringify(startIdentity))throw Error('Sources or binaries changed');
const summary={positions:rows.length,diagrams:5,fastInferiorWithinComparedSet:rows.filter(r=>r.searches.fast.comparisonGap>0).length,longPositions:rows.filter(r=>r.searches.long).length,longInferiorWithinComparedSet:rows.filter(r=>r.searches.long?.comparisonGap>0).length,
 fastBookMove:rows.filter(r=>r.searches.fast.bookMove).length,longActionChanges:rows.filter(r=>r.searches.long&&actionKey(r.searches.fast.pv[0])!==actionKey(r.searches.long.pv[0])).length};
await writeFile(path.join(out,'report.json'),JSON.stringify({format:'atlas-strategy-book-v1',createdAt:new Date().toISOString(),identity:startIdentity,summary,productionChanged:false,caveat:'Stocks, turn and owners are assumptions. Depth-three branch values use the same handcrafted heuristic, rank only the explicit comparison set and do not prove game outcomes. Teaching moves are not best-move labels. Five diagrams are not a representative strength test.',rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
