// Both spectator engines are loaded lazily inside module Workers.
import {verifyPressureBuild} from './evaluation/pressure-policy.mjs';
let pressureBuild='unverified';try{pressureBuild=verifyPressureBuild().binaryHash.slice(0,12);}catch{}
const nativeProxy=Object.fromEntries([['native',4317],['goal',4321]].map(([name,port])=>['/api/'+name,{target:'http://127.0.0.1:'+port,changeOrigin:true,rewrite:path=>path.replace('/api/'+name,'')} ]));
export default {define:{__PRESSURE_BUILD__:JSON.stringify(pressureBuild)},worker:{format:'es'},server:{proxy:nativeProxy},preview:{proxy:nativeProxy}};
