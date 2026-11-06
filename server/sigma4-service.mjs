import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createNativeService} from './native-service.mjs';
import {Sigma4Process} from './sigma4-process.mjs';

export function createSigma4Service(){
 const build=createHash('sha256')
  .update(readFileSync('vendor/sigma-quoridor/models/best.onnx'))
  .update(readFileSync('scripts/sigma4-bitset-wall-worker.py'))
  .update(readFileSync('scripts/sigma4-weighted-research-choice.mjs'))
  .update(readFileSync('server/sigma4-process.mjs'))
  .digest('hex').slice(0,12);
 return createNativeService({client:new Sigma4Process(),engineInfo:{
  id:'sigma4',label:'Sigma 4 (weighted V3)',
  version:'4.0 PUCT 200 + original weighted V3 root choice',
  variant:'SigmaQuoridor ONNX + 200 PUCT + weighted visit/Q root choice',
  build,promoted:false
 }});
}
