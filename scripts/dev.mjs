import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const children=[];
const run=(file,args=[],ipc=false)=>{const child=spawn(process.execPath,[file,...args],{stdio:ipc?['ignore','inherit','inherit','ipc']:'inherit',windowsHide:true});children.push(child);return child;};
async function native(){try{const response=await fetch('http://127.0.0.1:4317/health',{signal:AbortSignal.timeout(500)});if(response.ok&&(await response.json()).service==='quoridor-native-v1'){console.log('Using running Atlas native service.');return;}}catch{}
 const build=run(fileURLToPath(new URL('./build-native.mjs',import.meta.url)));const code=await new Promise(resolve=>build.once('exit',resolve));if(code===0&&!stopping)run(fileURLToPath(new URL('../server/native-service.mjs',import.meta.url)),[],true);else console.log('Native engine unavailable; the browser will use WASM.');}
let stopping=null;
native().catch(error=>console.error(error.message));
const vite=run(fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),['--host','127.0.0.1',...process.argv.slice(2)]);
const stop=()=>stopping??=Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();if(!child.connected){child.kill();return resolve();}const timer=setTimeout(()=>{child.kill();resolve();},2000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.send({op:'shutdown'},error=>{if(error){child.kill();clearTimeout(timer);resolve();}});}))).then(()=>process.exit());process.on('SIGINT',stop);process.on('SIGTERM',stop);vite.on('exit',stop);
