import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const nativeSources=['rust-engine/src/lib.rs','native-engine/src/lib.rs','native-engine/src/search.rs','native-engine/src/strategy.rs','native-engine/src/main.rs','native-engine/Cargo.toml','native-engine/Cargo.lock','rust-toolchain.toml'];
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function nativeSourceHash(){return digest(nativeSources.map(file=>file+':'+digest(readFileSync(path.join(root,file)))).join('\n'));}
export function assessNative(validation,holdout,sourceHash){
 const complete=r=>r.status==='completed'&&r.games.length===r.pairsPerSuite*4&&r.games.every(g=>g.replayValidated===true)&&['general','maze'].every(suite=>Array.from({length:r.pairsPerSuite},(_,i)=>[0,1].every(side=>r.games.filter(g=>g.suite===suite&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean));
 const counts=(r,suite)=>{const games=r.games.filter(g=>!suite||g.suite===suite);return {wins:games.filter(g=>g.result==='win').length,losses:games.filter(g=>g.result==='loss').length};};
 const v=counts(validation),h=counts(holdout);
 const checks={completed:complete(validation)&&complete(holdout),minimumSample:validation.games.length>=12&&holdout.games.length>=16,sourceUnchanged:[validation,holdout].every(r=>r.sourceHash===sourceHash),separateSplits:validation.split==='validation'&&holdout.split==='holdout'&&validation.fixtureSeed!==holdout.fixtureSeed,sameConditions:[validation,holdout].every(r=>r.ms===500&&r.cores===4&&r.candidate==='candidate'&&r.baseline==='baseline'),tactics:[validation,holdout].every(r=>r.tactics.length>=16&&r.tactics.every(t=>t.pass)),validationNoRegression:v.wins>=v.losses,holdoutPositive:h.wins>h.losses,suiteNoRegression:[validation,holdout].every(r=>['general','maze'].every(s=>{const c=counts(r,s);return c.wins>=c.losses;})),timeBudget:[validation,holdout].every(r=>r.timing.candidate.moves>0&&r.timing.candidate.overruns/r.timing.candidate.moves<.05)};
 return {eligible:Object.values(checks).every(Boolean),checks,caveat:'Small paired release gate; no claim of statistically decisive or human-level strength.'};
}
export function activeNativeProfile(){
 try{const release=JSON.parse(readFileSync(path.join(root,'evaluation/native-release.json')));if(!release.applied||release.sourceHash!==nativeSourceHash())return 'baseline';
  const manifest=JSON.parse(readFileSync(path.join(root,'native-engine/target/release/source-manifest.json')));
  if(nativeSources.some(file=>manifest.sources[file]!==digest(readFileSync(path.join(root,file)))))return 'baseline';
  const reports=release.reports.map(({file,sha256})=>{const bytes=readFileSync(path.join(root,file));if(digest(bytes)!==sha256)throw Error('Evaluation report changed');return JSON.parse(bytes);});
  return assessNative(...reports,release.sourceHash).eligible?'candidate':'baseline';
 }catch{return 'baseline';}
}
