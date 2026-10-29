// Both spectator engines are loaded lazily inside module Workers.
import {verifyPressureBuild} from './evaluation/pressure-policy.mjs';
let pressureBuild='unverified';try{pressureBuild=verifyPressureBuild().binaryHash.slice(0,12);}catch{}
const nativeProxy={'/api/goal':{target:'http://127.0.0.1:4321',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/goal/,'')},'/api/tempo':{target:'http://127.0.0.1:4320',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/tempo/,'')},'/api/native':{target:'http://127.0.0.1:4317',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/native/,'')},'/api/experimental':{target:'http://127.0.0.1:4318',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/experimental/,'')},'/api/pressure':{target:'http://127.0.0.1:4319',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/pressure/,'')}};
export default {define:{__PRESSURE_BUILD__:JSON.stringify(pressureBuild)},worker:{format:'es'},server:{proxy:nativeProxy},preview:{proxy:nativeProxy}};
