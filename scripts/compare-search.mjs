import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {verifyMazeBuild,mazeSearchModes} from '../evaluation/maze-candidate-policy.mjs';
import {SEARCH_COHORTS} from '../evaluation/search-fixtures.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2]??'reports/search55';
const args=process.argv.slice(3),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const searchModes=get('--searches','legacy,ordering,protected').split(','),cohort=get('--cohort','search56-v1');
if(searchModes.length<2||new Set(searchModes).size!==searchModes.length||!searchModes.includes('legacy')||searchModes.some(m=>!mazeSearchModes.includes(m))||!(cohort in SEARCH_COHORTS))throw Error('Invalid search comparison modes or cohort');
try{await readFile(path.join(out,'comparison.json'));throw Error('Use a fresh comparison directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const sources=Object.fromEntries(await Promise.all(['scripts/compare-search.mjs','scripts/evaluate-maze.mjs','scripts/verify-maze.mjs','evaluation/search-fixtures.mjs','evaluation/maze-candidate-policy.mjs'].map(async f=>[f,digest(await readFile(f))])));
const report={format:'atlas-search-comparison-v2',status:'running',identity:verifyMazeBuild(),sources,mode:'cache4',searchModes,cohort,ms:500,cores:4,pairs:1,arenas:[],productionActive:false};
await mkdir(out,{recursive:true});const save=()=>writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
async function run(script,args){const child=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`${script} failed: ${code}`);}
try{
 await save();
 for(const searchMode of searchModes){
  const directory=path.join(out,`${searchMode}-development`),file=path.join(directory,'report.json');let arena;
  try{arena=JSON.parse(await readFile(file));if(arena.status!=='completed')throw Error('Preserve partial arenas and use a fresh comparison directory');}
  catch(e){if(e.code!=='ENOENT')throw e;await run('scripts/evaluate-maze.mjs',['--out',directory,'--mode','cache4','--search',searchMode,'--cohort',cohort,'--split','development','--pairs','1','--ms','500','--cores','4','--max-plies','180']);arena=JSON.parse(await readFile(file));}
  await run('scripts/verify-maze.mjs',[directory,'--save']);
  if(arena.searchMode!==searchMode||arena.mode!=='cache4'||arena.cohort!==report.cohort||arena.split!=='development'||arena.ms!==500||arena.cores!==4||arena.pairs!==1||JSON.stringify(arena.identity)!==JSON.stringify(report.identity))throw Error('Comparison conditions mismatch');
  report.arenas.push({searchMode,file:path.relative(out,file),sha256:digest(await readFile(file)),summary:arena.summary,bySuite:Object.fromEntries(['general','maze'].map(s=>[s,Object.fromEntries(['win','loss','draw'].map(r=>[r,arena.games.filter(g=>g.suite===s&&g.result===r).length]))])),tactics:arena.tactics.filter(t=>t.pass).length,timing:arena.timing});await save();
 }
 for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Comparison source changed');if(JSON.stringify(verifyMazeBuild())!==JSON.stringify(report.identity))throw Error('Comparison binary changed');report.status='completed';await save();console.log(JSON.stringify(report.arenas.map(a=>({search:a.searchMode,...a.summary}))));
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
