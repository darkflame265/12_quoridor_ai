import {createNativeService} from './native-service.mjs';
import {SigmaProcess} from './sigma-process.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function createSigmaService(variant='sigma2'){
 if(!['sigma2','sigma3'].includes(variant))throw Error('Unsupported Sigma variant');
 const hash=createHash('sha256').update(readFileSync('vendor/sigma-quoridor/models/best.onnx')).digest('hex').slice(0,12);
 return createNativeService({client:new SigmaProcess({variant}),engineInfo:{id:variant==='sigma2'?'sigma2':'sigma',label:variant==='sigma2'?'Sigma 2 (experimental)':'Sigma 1',version:variant==='sigma2'?'2.0 PUCT 200':'1.0 PUCT 50',variant:'SigmaQuoridor ONNX + PUCT',build:hash,promoted:false}});
}
