import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function runtimeFingerprint(root){
 const files=['index.html','style.css','screen.css','package.json','package-lock.json','vite.config.js','requirements.txt',
  'scripts/play.mjs','scripts/play-lock.mjs','scripts/runtime-identity.mjs','scripts/sigma2-baseline-worker.py','scripts/sigma-inference-worker.py',
  'scripts/sigma3_tactical.py','scripts/sigma3_attack.py','scripts/sigma3_midgame.py','scripts/sigma4-lookahead-choice.mjs','scripts/sigma4-tactical-choice.mjs','scripts/sigma4-tactical-escape.mjs'];
 async function walk(dir){for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){if(e.name==='__pycache__')continue;const file=dir+'/'+e.name;if(e.isDirectory())await walk(file);else if(!/\.test\./.test(file)&&/\.(js|mjs|py|css|onnx)$/.test(file))files.push(file);}}
 for(const dir of ['src','server','vendor/sigma-quoridor'])await walk(dir);
 const hash=createHash('sha256');for(const file of files.sort())hash.update(file+'\0').update(await readFile(path.join(root,file)));return hash.digest('hex');
}
