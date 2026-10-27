import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),manifest=JSON.parse(await readFile('public/atlas-wasm.json'));
if(hash(await readFile('public/atlas.wasm'))!==manifest.artifact)throw Error('WASM artifact mismatch');
for(const [file,sha]of Object.entries(manifest.sources))if(hash(await readFile(file))!==sha)throw Error(`WASM source changed: ${file}`);
const reports=['atlas4-maze-holdout','atlas4-external-mcts','atlas4-external-holdout'],results=[];
for(const name of reports){const report=JSON.parse(await readFile(`reports/${name}/report.json`));if(report.status!=='completed'||report.sourceHash!==manifest.artifact||report.games.length!==report.pairs*2||!report.tactics.every(t=>t.pass))throw Error(`Incomplete or stale evaluation: ${name}`);
 for(const summary of report.games){const game=JSON.parse(await readFile(`reports/${name}/${summary.file}`));let state=initial();for(const action of game.records){if(!legal(state,action))throw Error(`Illegal replay: ${summary.id}`);state=apply(state,action);}if(state.winner!==game.winner)throw Error(`Winner mismatch: ${summary.id}`);}
 results.push({report:`reports/${name}/report.json`,games:report.games.length,wins:report.summary.wins,losses:report.summary.losses,draws:report.summary.draws});
}
const registry=JSON.parse(await readFile('models/registry.json'));if(registry.active!==null||registry.metadata.productionActive!==false)throw Error('Unverified bootstrap neural model unexpectedly activated');
if(hash(await readFile('models/candidate.json'))!==registry.sha256)throw Error('Candidate model checksum mismatch');
const release={date:new Date().toISOString(),productionEngine:'Atlas 4 Rust/WASM',wasmSha256:manifest.artifact,parallelWorkersMax:4,ponderMs:250,neuralModelActive:false,neuralCheckpointIteration:registry.metadata.iteration,evaluations:results,limitations:['Dense-maze strength superiority over Atlas 3 is not demonstrated (6-6).','Initial CPU neural model did not pass promotion.','No expert human match or superhuman-strength claim.']};
await writeFile('reports/atlas4-release.json',JSON.stringify(release,null,2)+'\n');console.log(JSON.stringify(release,null,2));
