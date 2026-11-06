import {createNativeService} from './native-service.mjs';
import {SigmaProcess} from './sigma-process.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function createSigmaService(variant='sigma2'){
 if(!['sigma2','sigma3'].includes(variant))throw Error('Unsupported Sigma variant');
 const identityFiles=['vendor/sigma-quoridor/models/best.onnx',variant==='sigma2'?'scripts/sigma2-baseline-worker.py':'scripts/sigma-inference-worker.py','scripts/sigma_search_runtime.py','scripts/sigma_fast_walls.py','scripts/sigma_inference_cache.py','vendor/sigma-quoridor/mcts.py'];
 const identity=createHash('sha256');for(const file of identityFiles)identity.update(file+'\0').update(readFileSync(file));const hash=identity.digest('hex').slice(0,12);
 return createNativeService({client:new SigmaProcess({variant}),engineInfo:{id:variant,label:variant==='sigma3'?'Sigma 3 (experimental)':'Sigma 2 (baseline)',version:variant==='sigma3'?'3.0 timed PUCT up to 200 + corridor safety':'2.0 timed PUCT up to 200',variant:'SigmaQuoridor ONNX + deadline-capped PUCT',build:hash,promoted:false}});
}
