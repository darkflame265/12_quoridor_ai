import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {verifyMazeBuild,mazeExecutable,mazeModes,mazeSearchModes,mazeGeometryModes} from '../evaluation/maze-candidate-policy.mjs';
import {activeNativeProfile,digest} from '../evaluation/native-policy.mjs';
import {legal} from '../src/engine.js';
import {actionKey} from '../evaluation/native-diagnostics.mjs';
const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const out=get('--out','reports/maze-candidate/review-v1'),ms=Number(get('--ms',500));
const mode=get('--mode','cache4');if(!mazeModes.includes(mode))throw Error('Unknown maze mode');process.env.QUORIDOR_MAZE_MODE=mode;
const searchMode=get('--search','legacy');if(!mazeSearchModes.includes(searchMode))throw Error('Unknown search mode');process.env.QUORIDOR_MAZE_SEARCH=searchMode;
const geometryMode=get('--geometry','legacy');if(!mazeGeometryModes.includes(geometryMode))throw Error('Unknown geometry mode');process.env.QUORIDOR_MAZE_GEOMETRY=geometryMode;
if(!Number.isInteger(ms)||ms<1||ms>30000||activeNativeProfile()!=='candidate')throw Error('Invalid review configuration');
try{await readFile(path.join(out,'report.json'));throw Error('Use a fresh review directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const bytes=await readFile('evaluation/fixtures/native54-search-review.json'),fixtures=JSON.parse(bytes),identity=verifyMazeBuild();
const report={format:'atlas-maze-candidate-review-v4',status:'running',mode,searchMode,geometryMode,identity,baselineBinary:digest(await readFile(nativeExecutable)),fixtureSha256:digest(bytes),ms,cores:4,cases:[],productionActive:false,warning:'Agreement with old long-search references is development diagnosis, not a strength gate.'};
await mkdir(out,{recursive:true});
for(const f of fixtures.cases){
 const item={id:f.id,reference:f.referenceAction,players:{}};
 for(const [role,executable] of [['baseline',nativeExecutable],['candidate',mazeExecutable]]){
  const engine=new NativeProcess({profile:'candidate',executable});try{await engine.health();const start=performance.now(),r=await engine.search(f.state,{ms,cores:4});if(!r.pv[0]||!legal(f.state,r.pv[0]))throw Error('Illegal review action');item.players[role]={...r,wallTimeMs:performance.now()-start,agreesWithReference:actionKey(r.pv[0])===actionKey(f.referenceAction)};}finally{engine.close();}
 }report.cases.push(item);console.log(`${f.id}: baseline depth ${item.players.baseline.depth}, candidate depth ${item.players.candidate.depth}`);
}
if(JSON.stringify(identity)!==JSON.stringify(verifyMazeBuild())||report.baselineBinary!==digest(await readFile(nativeExecutable)))throw Error('Review engines changed');
report.status='completed';report.summary=Object.fromEntries(['baseline','candidate'].map(role=>[role,{referenceAgreements:report.cases.filter(c=>c.players[role].agreesWithReference).length,nodes:report.cases.reduce((n,c)=>n+c.players[role].nodes,0),meanDepth:report.cases.reduce((n,c)=>n+c.players[role].depth,0)/report.cases.length}]));
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
