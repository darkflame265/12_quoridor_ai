import {watch} from 'node:fs';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {homedir} from 'node:os';
import {createPressureService} from '../server/pressure-service.mjs';

export function watchPressure({root,folder,getCurrent,replace,onStatus=()=>{},debounceMs=2000,build=null,createService=createPressureService}){
 let timer=null,running=false,dirty=false,closed=false;
 const watchers=[];
 const executable=path.join(folder,'hot-target','release',process.platform==='win32'?'quoridor-pressure.exe':'quoridor-pressure');
 const compile=build??(()=>new Promise((resolve,reject)=>{
  const cargo=path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo');
  const child=spawn(cargo,['build','--locked','--release','--manifest-path','pressure-engine/Cargo.toml','--target-dir',path.join(folder,'hot-target')],{cwd:root,windowsHide:true,stdio:'ignore'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Pressure build failed: '+code)));
 }));
 async function run(){
  if(closed||running){dirty=true;return;}
  running=true;dirty=false;
  try{
   onStatus('building');
   await mkdir(folder,{recursive:true});
   await compile();
   if(closed)return;
   const contents=await readFile(executable);
   const hash=createHash('sha256').update(contents).digest('hex');
   const staged=path.join(folder,'pressure-'+hash.slice(0,16)+(process.platform==='win32'?'.exe':''));
   await copyFile(executable,staged);
   const next=createService({goal:true,executable:staged,build:hash});
   try{
    await next.client.health();
    await new Promise((resolve,reject)=>{next.server.once('error',reject);next.server.listen(0,'127.0.0.1',resolve);});
    if(closed){await next.close();return;}
    onStatus('ready');
    await replace(next,()=>closed);
    onStatus('applied');
   }catch(error){await next.close();throw error;}
  }catch(error){onStatus('failed',error);}
  finally{running=false;if(dirty&&!closed)schedule();}
 }
 function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void run();},debounceMs);timer.unref?.();}
 for(const dir of ['pressure-engine','native-engine','rust-engine']){
  const watcher=watch(path.join(root,dir),{recursive:true},(_event,file)=>{
   if(!file||!/(?:\.rs|\.toml|\.lock)$/.test(file)||/(?:^|[\\/])target(?:[\\/]|$)/.test(file))return;
   schedule();
  });
  watchers.push(watcher);
 }
 return {trigger:schedule,close(){closed=true;clearTimeout(timer);for(const w of watchers)w.close();}};
}
