import {NativeProcess} from './native-process.mjs';
import {createNativeService} from './native-service.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const executable=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
export function createAtlas6Service(){
 const hash=createHash('sha256').update(readFileSync(executable)).digest('hex').slice(0,12);
 return createNativeService({client:new NativeProcess({executable,profile:'baseline'}),engineInfo:{
  id:'atlas6',label:'Atlas 6 · 독립 탐색 실험',version:'0.2 experimental',variant:'4-core PVS · wall-free/one-wall exact · 승률 검증 전',build:hash,promoted:false
 }});
}
