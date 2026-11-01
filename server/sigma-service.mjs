import {createNativeService} from './native-service.mjs';
import {SigmaProcess} from './sigma-process.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function createSigmaService(){
 const hash=createHash('sha256').update(readFileSync('vendor/sigma-quoridor/models/best.onnx')).digest('hex').slice(0,12);
 return createNativeService({client:new SigmaProcess(),engineInfo:{id:'sigma',label:'Sigma 1',version:'1.0 PUCT 50',variant:'SigmaQuoridor ONNX + PUCT',build:hash,promoted:false}});
}
