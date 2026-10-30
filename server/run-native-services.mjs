import {createNativeService} from './native-service.mjs';
import {createPressureService} from './pressure-service.mjs';
import {spawnSync} from 'node:child_process';
import {verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
const services=[];
async function listen(service,port){
 let running=null;try{const response=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});if(response.ok)running=await response.json();}catch{}
 if(running){await service.close();if(running.service==='quoridor-native-v1'&&['id','version','build'].every(k=>running.engineInfo?.[k]===service.engineInfo[k])){console.log(`Using current engine service on ${port}`);return;}throw Error(`포트 ${port}에 이전 엔진이 실행 중입니다. 해당 개발 서버를 종료한 뒤 다시 실행하세요.`);}
 try{await service.client.health();await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(port,'127.0.0.1',resolve);});services.push(service);}catch(error){await service.close();throw error;}
}
const stop=()=>Promise.all(services.map(s=>s.close())).finally(()=>process.exit());
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('disconnect',stop);process.on('message',m=>{if(m?.op==='shutdown')stop();});
try{
 await listen(createNativeService(),Number(process.env.QUORIDOR_NATIVE_PORT??4317));
 try{verifyPressureBuild();}catch{const r=spawnSync(process.execPath,['scripts/build-pressure.mjs'],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('Engine build failed');}
 try{await listen(createPressureService({goal:true}),Number(process.env.QUORIDOR_GOAL_PORT??4321));}catch(error){console.error(`골인 안전 엔진 사용 불가: ${error.message}`);}
 console.log('Atlas 5.3 and 0.4 services ready.');
}catch(error){console.error(error.message);await stop();}
