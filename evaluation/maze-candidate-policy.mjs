import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const mazeExecutable=fileURLToPath(new URL(`../experimental-engine/target/release/quoridor-maze-candidate${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const mazeModes=['baseline','cache4','reserve','coverage8','combined8','reference8'];
export const mazeSearchModes=['legacy','ordering','protected'];
export const mazeSources=[...nativeSources,'experimental-engine/Cargo.toml','experimental-engine/Cargo.lock','experimental-engine/build.rs','experimental-engine/src/lib.rs','experimental-engine/src/main.rs','experimental-engine/src/maze-evaluation.rs','experimental-engine/src/tactical-ordering.rs','experimental-engine/src/bin/eval-benchmark.rs','evaluation/fixtures/native54-search-review.json'];
export function mazeIdentity(){return {baselineSourceHash:nativeSourceHash(),sources:Object.fromEntries(mazeSources.map(f=>[f,digest(readFileSync(f))])),binaryHash:digest(readFileSync(mazeExecutable))};}
export function verifyMazeBuild(){const saved=JSON.parse(readFileSync('experimental-engine/target/release/source-manifest.json'));const current=mazeIdentity();if(JSON.stringify(current)!==JSON.stringify(saved))throw Error('Rebuild the experimental maze engine');return current;}
export function assessMaze(validation,holdout){
 const complete=r=>r?.status==='completed'&&r.games.length===r.pairs*4&&r.games.every(g=>g.replayValidated)&&['general','maze'].every(suite=>Array.from({length:r.pairs},(_,i)=>[0,1].every(side=>r.games.filter(g=>g.suite===suite&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean));
 const counts=(r,suite)=>{const g=r?.games?.filter(g=>!suite||g.suite===suite)??[];return {w:g.filter(g=>g.result==='win').length,l:g.filter(g=>g.result==='loss').length};};
 const v=counts(validation),h=counts(holdout);
 const checks={completed:complete(validation)&&complete(holdout),samples:(validation?.games.length??0)>=12&&(holdout?.games.length??0)>=16,conditions:[validation,holdout].every(r=>r?.ms===500&&r?.cores===4&&r?.maxPlies>=180),separateSplits:validation?.split==='validation'&&holdout?.split==='holdout',sameCandidate:JSON.stringify(validation?.identity)===JSON.stringify(holdout?.identity)&&validation?.mode===holdout?.mode&&validation?.searchMode===holdout?.searchMode&&validation?.cohort===holdout?.cohort,validationPositive:v.w>v.l,holdoutPositive:h.w>h.l,suites:[validation,holdout].every(r=>['general','maze'].every(s=>{const c=counts(r,s);return c.w>=c.l;})),tactics:[validation,holdout].every(r=>r?.tactics?.length===16&&r.tactics.every(t=>t.pass)),deadline:[validation,holdout].every(r=>r?.timing?.candidate.moves>0&&r.timing.candidate.overruns/r.timing.candidate.moves<.05)};
 return {eligible:Object.values(checks).every(Boolean),checks,productionActive:false};
}
