import {createNativeService} from './native-service.mjs';
import {NativeProcess} from './native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
export function createPressureService(){const identity=verifyPressureBuild();return createNativeService({client:new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on'}}),engineInfo:{id:'atlas-pressure',label:'Atlas 즉시 압박',version:'0.2 실험',variant:'5.3 + 가까운 길목·보유 벽 실효성 평가',build:identity.binaryHash.slice(0,12),promoted:false}});}
