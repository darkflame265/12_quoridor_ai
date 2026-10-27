import {readFile,writeFile} from 'node:fs/promises';
import {assessNative,nativeSourceHash,digest} from '../evaluation/native-policy.mjs';
import {initial,legal,apply} from '../src/engine.js';
import path from 'node:path';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const files=[get('--validation','reports/native53/validation/report.json'),get('--holdout','reports/native53/holdout/report.json')],bytes=await Promise.all(files.map(f=>readFile(f))),reports=bytes.map(b=>JSON.parse(b));
for(const [i,report] of reports.entries())for(const summary of report.games){const game=JSON.parse(await readFile(path.join(path.dirname(files[i]),summary.file)));const opening=nativeFixtures(report.split,summary.suite,report.pairsPerSuite,report.cohort??'v1')[summary.openingIndex];if(game.openingPlies!==opening.records.length||JSON.stringify(game.records.slice(0,game.openingPlies))!==JSON.stringify(opening.records))throw Error('Evaluation opening does not match frozen fixture');let state=initial();for(const action of game.records){if(!legal(state,action))throw Error('Invalid evaluation replay');state=apply(state,action);}const result=state.winner===null?'draw':state.winner===game.candidateSide?'win':'loss';if(result!==summary.result||game.result!==result||state.winner!==game.winner||game.candidateSide!==summary.candidateSide)throw Error('Evaluation replay metadata mismatch');}
const sourceHash=nativeSourceHash(),assessment=assessNative(...reports,sourceHash),release={date:new Date().toISOString(),sourceHash,...assessment,reports:files.map((file,i)=>({file,sha256:digest(bytes[i])})),applied:assessment.eligible&&args.includes('--apply')};
const decisionFile=args.includes('--apply')?'evaluation/native-release.json':get('--out',path.join(path.dirname(files[0]),'promotion-check.json'));
await writeFile(decisionFile,JSON.stringify(release,null,2));console.log(JSON.stringify(release,null,2));
if(!assessment.eligible)process.exitCode=1;
