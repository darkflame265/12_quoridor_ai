import {createNativeService} from './native-service.mjs';
import {NativeProcess} from './native-process.mjs';
import {mazeExecutable,verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
export function createExperimentalService(){
 const identity=verifyMazeBuild();
 return createNativeService({client:new NativeProcess({executable:mazeExecutable,profile:'candidate',env:{QUORIDOR_MAZE_MODE:'late-full',QUORIDOR_MAZE_SEARCH:'legacy',QUORIDOR_MAZE_GEOMETRY:'legacy',QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:'30'}}),
  engineInfo:{id:'atlas-experiment',label:'Atlas 실험',version:'5.9 experiment',variant:'late-full',build:identity.binaryHash.slice(0,12),promoted:false}});
}
