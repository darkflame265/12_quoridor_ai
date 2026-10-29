import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function runtimeFingerprint(root){
 const files=['index.html','package.json','package-lock.json','vite.config.js','rust-toolchain.toml'];
 async function walk(dir){for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){if(['target','node_modules','.git'].includes(e.name))continue;const file=dir+'/'+e.name;if(e.isDirectory())await walk(file);else if(/\.(js|mjs|rs|toml|lock|css|wasm)$/.test(file))files.push(file);}}
 for(const dir of ['src','server','scripts','evaluation','pressure-engine','native-engine','rust-engine'])await walk(dir);
 const hash=createHash('sha256');for(const file of ['pressure-engine/target/release/source-manifest.json','native-engine/target/release/source-manifest.json']){try{hash.update(file).update(await readFile(path.join(root,file)));}catch{}}for(const file of files.sort())hash.update(file+'\0').update(await readFile(path.join(root,file)));return hash.digest('hex');
}
