import {createNativeService} from './native-service.mjs';
import {createExperimentalService} from './experimental-service.mjs';
import {createPressureService} from './pressure-service.mjs';
import {spawnSync} from 'node:child_process';
import {verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
const services=[];
async function listen(service,port){services.push(service);await service.client.health();await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(port,'127.0.0.1',resolve);});}
const stop=()=>Promise.all(services.map(s=>s.close())).finally(()=>process.exit());
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('disconnect',stop);process.on('message',m=>{if(m?.op==='shutdown')stop();});
try{
 await listen(createNativeService(),Number(process.env.QUORIDOR_NATIVE_PORT??4317));
 try{await listen(createExperimentalService(),Number(process.env.QUORIDOR_EXPERIMENTAL_PORT??4318));}catch(error){console.error(`실험 엔진 사용 불가: ${error.message}`);}
 try{try{verifyPressureBuild();}catch{const r=spawnSync(process.execPath,['scripts/build-pressure.mjs'],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('즉시 압박 엔진 빌드 실패');}await listen(createPressureService(),Number(process.env.QUORIDOR_PRESSURE_PORT??4319));}catch(error){console.error(`즉시 압박 엔진 사용 불가: ${error.message}`);}
 console.log('Atlas stable and available experimental services ready.');
}catch(error){console.error(error.message);await stop();}
