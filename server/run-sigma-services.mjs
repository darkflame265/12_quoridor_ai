import {createSigmaService} from './sigma-service.mjs';
import {createSigma4Service} from './sigma4-service.mjs';
const services=[];let stopping;
const stop=()=>stopping??=Promise.all(services.map(s=>s.close())).finally(()=>process.exit());
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('message',m=>{if(m?.op==='shutdown')stop();});process.on('disconnect',stop);
try{for(const [engine,port] of [['sigma2',4322],['sigma3',4323],['sigma4',4324]]){const s=engine==='sigma4'?createSigma4Service():createSigmaService(engine);services.push(s);await s.client.health();await new Promise((resolve,reject)=>{s.server.once('error',reject);s.server.listen(port,'127.0.0.1',resolve);});console.log(`${engine}: http://127.0.0.1:${port}`);}}catch(error){console.error(error.message);await stop();}
