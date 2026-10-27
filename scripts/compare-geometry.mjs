import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {verifyMazeBuild,mazeGeometryModes} from '../evaluation/maze-candidate-policy.mjs';
import {SEARCH_COHORTS} from '../evaluation/search-fixtures.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2]??'reports/geometry58',args=process.argv.slice(3),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const geometries=get('--geometries','legacy,rank-only,rank-eval').split(','),cohort=get('--cohort','search58-v1');
if(geometries.length<2||new Set(geometries).size!==geometries.length||!geometries.includes('legacy')||geometries.some(g=>!mazeGeometryModes.includes(g))||!(cohort in SEARCH_COHORTS))throw Error('Invalid geometry comparison');
try{await readFile(path.join(out,'comparison.json'));throw Error('Use a fresh comparison directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const sourceFiles=['scripts/compare-geometry.mjs','scripts/evaluate-maze.mjs','scripts/verify-maze.mjs','evaluation/maze-candidate-policy.mjs','evaluation/search-fixtures.mjs'];
const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,digest(await readFile(f))])));
const report={format:'atlas-geometry-comparison-v2',status:'running',identity:verifyMazeBuild(),sources,geometryModes:geometries,cohort,mode:'cache4',searchMode:'legacy',arenas:[],productionActive:false};
await mkdir(out,{recursive:true});const save=()=>writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
async function run(script,args){const child=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`${script} failed: ${code}`);}
try{
 await save();for(const geometry of geometries){
  const directory=path.join(out,`${geometry}-development`);await run('scripts/evaluate-maze.mjs',['--out',directory,'--mode','cache4','--search','legacy','--geometry',geometry,'--cohort',cohort,'--split','development','--pairs','1','--ms','500','--cores','4','--max-plies','180']);
  await run('scripts/verify-maze.mjs',[directory,'--save']);const file=path.join(directory,'report.json'),bytes=await readFile(file),arena=JSON.parse(bytes);
  report.arenas.push({geometryMode:geometry,file:path.relative(out,file),sha256:digest(bytes),summary:arena.summary,timing:arena.timing,tactics:arena.tactics.filter(t=>t.pass).length});await save();
 }for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Comparison source changed');if(JSON.stringify(verifyMazeBuild())!==JSON.stringify(report.identity))throw Error('Comparison build changed');report.status='completed';await save();console.log(JSON.stringify(report.arenas.map(a=>({geometry:a.geometryMode,...a.summary}))));
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
