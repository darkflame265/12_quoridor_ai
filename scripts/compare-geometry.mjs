import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2]??'reports/geometry57';try{await readFile(path.join(out,'comparison.json'));throw Error('Use a fresh comparison directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const sourceFiles=['scripts/compare-geometry.mjs','scripts/evaluate-maze.mjs','scripts/verify-maze.mjs','evaluation/maze-candidate-policy.mjs','evaluation/search-fixtures.mjs'];
const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,digest(await readFile(f))])));
const report={format:'atlas-geometry-comparison-v1',status:'running',identity:verifyMazeBuild(),sources,cohort:'search57-v1',mode:'cache4',searchMode:'legacy',arenas:[],productionActive:false};
await mkdir(out,{recursive:true});const save=()=>writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
async function run(script,args){const child=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`${script} failed: ${code}`);}
try{
 await save();for(const geometry of ['legacy','physical']){
  const directory=path.join(out,`${geometry}-development`);await run('scripts/evaluate-maze.mjs',['--out',directory,'--mode','cache4','--search','legacy','--geometry',geometry,'--cohort','search57-v1','--split','development','--pairs','1','--ms','500','--cores','4','--max-plies','180']);
  await run('scripts/verify-maze.mjs',[directory,'--save']);const file=path.join(directory,'report.json'),bytes=await readFile(file),arena=JSON.parse(bytes);
  report.arenas.push({geometryMode:geometry,file:path.relative(out,file),sha256:digest(bytes),summary:arena.summary,timing:arena.timing,tactics:arena.tactics.filter(t=>t.pass).length});await save();
 }for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Comparison source changed');if(JSON.stringify(verifyMazeBuild())!==JSON.stringify(report.identity))throw Error('Comparison build changed');report.status='completed';await save();console.log(JSON.stringify(report.arenas.map(a=>({geometry:a.geometryMode,...a.summary}))));
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
