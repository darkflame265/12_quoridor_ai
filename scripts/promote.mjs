import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function assess(validation,holdout,sourceHash){
 const complete=r=>r.games.length===r.pairs*2&&r.summary.wins+r.summary.losses+r.summary.draws===r.games.length;
 const tactical=r=>r.tactics.length>=16&&r.tactics.every(t=>t.pass);
 const checks={validationComplete:complete(validation),holdoutComplete:complete(holdout),sameFrozenCandidate:validation.sourceHash===sourceHash&&holdout.sourceHash===sourceHash,correctSplits:validation.split==='validation'&&holdout.split==='holdout',sameBaseline:validation.opponent==='atlas2'&&holdout.opponent==='atlas2',minimumSample:validation.games.length>=12&&holdout.games.length>=16,tactics:tactical(validation)&&tactical(holdout),validationNoRegression:validation.summary.wins>=validation.summary.losses,holdoutPositive:holdout.summary.wins>holdout.summary.losses,timeBudget:(holdout.summary.candidate.overruns/Math.max(1,holdout.summary.candidate.moves))<0.05};
 return {eligible:Object.values(checks).every(Boolean),checks,caveat:'Release smoke gate only. A small positive paired sample does not establish statistically decisive superiority or human-level strength.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const files=[get('--validation','reports/atlas3-validation/report.json'),get('--holdout','reports/atlas3-holdout/report.json')],reports=await Promise.all(files.map(async f=>JSON.parse(await readFile(f,'utf8'))));
 const sourceHash=createHash('sha256').update(await readFile(new URL('../src/search.js',import.meta.url))).digest('hex'),assessment=assess(...reports,sourceHash);
 // Every archived replay must still be a legal, complete representation of its report entry.
 const {initial,apply,legal}=await import('../src/engine.js');
 for(let i=0;i<reports.length;i++)for(const summary of reports[i].games){const game=JSON.parse(await readFile(path.join(path.dirname(files[i]),summary.file),'utf8'));let s=initial();for(const a of game.records){if(!legal(s,a))throw Error(`Illegal replay: ${summary.file}`);s=apply(s,a);}if(game.result!==summary.result||game.winner!==s.winner)throw Error('Replay metadata mismatch');}
 const release={date:new Date().toISOString(),sourceHash,reports:files,...assessment,applied:false};
 if(assessment.eligible&&args.includes('--apply')){const worker=new URL('../src/ai-worker.js',import.meta.url),source=await readFile(worker,'utf8');if(!source.includes("from './baselines/atlas2.js'")&&!source.includes("from './search.js'"))throw Error('Unexpected worker import');await writeFile(worker,source.replace("from './baselines/atlas2.js'","from './search.js'"));release.applied=true;}
 await writeFile('reports/atlas3-release.json',JSON.stringify(release,null,2));console.log(JSON.stringify(release,null,2));if(!assessment.eligible)process.exitCode=1;
}
