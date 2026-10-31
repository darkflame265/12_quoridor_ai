import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {watchPressure} from './pressure-hot-reload.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(fn){
 const root=await mkdtemp(path.join(tmpdir(),'quoridor-watch-')),folder=path.join(root,'.local-app');
 for(const dir of ['pressure-engine','native-engine','rust-engine'])await mkdir(path.join(root,dir),{recursive:true});
 try{await fn(root,folder);}finally{await rm(root,{recursive:true,force:true});}
}
test('debounces changes and activates verified candidate without stopping watcher',async()=>{
 await fixture(async(root,folder)=>{
  let builds=0,applied=0;const statuses=[];
  const watcher=watchPressure({root,folder,debounceMs:40,
   build:async()=>{builds++;await mkdir(path.join(folder,'hot-target','release'),{recursive:true});await writeFile(path.join(folder,'hot-target','release',process.platform==='win32'?'quoridor-pressure.exe':'quoridor-pressure'),'fixture');},
   createService:()=>({client:{health:async()=>({ok:true})},server:{once(){},listen(_port,_host,done){done();}},close:async()=>{}}),
   replace:async()=>{applied++;},onStatus:s=>statuses.push(s)});
  try{
   for(let i=0;i<3;i++){await writeFile(path.join(root,'pressure-engine','sample.rs'),String(i));await pause(10);}
   await pause(300);
   assert.equal(builds,1);assert.equal(applied,1);assert.ok(statuses.includes('applied'));
  }finally{watcher.close();}
 });
});
test('failed rebuild does not replace working engine',async()=>{
 await fixture(async(root,folder)=>{
  let replaced=0;const states=[];
  const watcher=watchPressure({root,folder,debounceMs:30,build:async()=>{throw Error('compile failed');},
   replace:async()=>{replaced++;},onStatus:s=>states.push(s)});
  try{await writeFile(path.join(root,'pressure-engine','broken.rs'),'bad');await pause(200);assert.equal(replaced,0);assert.ok(states.includes('failed'));}
  finally{watcher.close();}
 });
});
