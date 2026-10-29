import {createNativeService} from './native-service.mjs';
import {NativeProcess} from './native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
export function createPressureService({tempo=false}={}){const identity=verifyPressureBuild();return createNativeService({client:new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:tempo?'on':'off'}}),engineInfo:{id:tempo?'atlas-tempo':'atlas-pressure',label:tempo?'Atlas 벽 투자':'Atlas 즉시 압박',version:tempo?'0.3 실험':'0.2 실험',variant:tempo?'준비 벽 비용·후속 연결·방어 효과 평가':'5.3 + 가까운 길목·보유 벽 실효성 평가',build:identity.binaryHash.slice(0,12),promoted:false}});}
