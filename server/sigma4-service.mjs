import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createNativeService} from './native-service.mjs';
import {Sigma4Process} from './sigma4-process.mjs';

export function createSigma4Service(){
 const build=createHash('sha256')
  .update(readFileSync('vendor/sigma-quoridor/models/best.onnx'))
  .update(readFileSync('scripts/sigma-inference-worker.py'))
  .update(readFileSync('scripts/sigma4-lookahead-choice.mjs'))
  .update(readFileSync('server/sigma4-process.mjs'))
  .digest('hex').slice(0,12);
 return createNativeService({client:new Sigma4Process(),engineInfo:{
  id:'sigma4',label:'Sigma 4 (experimental)',
  version:'4.0 PUCT 200 + bounded 3-ply tactical lookahead',
  variant:'SigmaQuoridor ONNX + PUCT + tactical Q/visits',
  build,promoted:false
 }});
}
