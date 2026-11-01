import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
export const nativeExecutable=fileURLToPath(new URL(`../native-engine/target/release/quoridor-native${process.platform==='win32'?'.exe':''}`,import.meta.url));
export class NativeProcess{
 constructor({executable=nativeExecutable,profile='baseline',env}={}){this.env=env;this.executable=executable;this.profile=profile;this.child=null;this.pending=new Map();this.starts=0;this.closed=false;}
 ensure(){if(this.closed)throw Error('Native process closed');if(this.child)return;const child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:this.env?{...process.env,...this.env}:process.env});this.child=child;this.starts++;
  const fail=error=>{if(this.child!==child)return;this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();};
  child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(`Native process exited (${code??signal})`)));child.stdin.on('error',fail);child.stderr.on('data',()=>{});
  readline.createInterface({input:child.stdout}).on('line',line=>{let r;try{r=JSON.parse(line);}catch{return;}const p=this.pending.get(r.id);if(!p)return;
   if(r.done){this.pending.delete(r.id);clearTimeout(p.timer);if(r.error)p.reject(Error(r.error));else if(r.cancelled)p.reject(Object.assign(Error('Native search cancelled'),{name:'AbortError'}));else p.resolve(r);}
   else p.onProgress(r);
  });
 }
 send(value){this.ensure();this.child.stdin.write(JSON.stringify(value)+'\n');}
 request(value,{onProgress=()=>{},timeoutMs=2000}={}){const id=value.id??randomUUID();if(this.pending.has(id))return Promise.reject(Error('Duplicate request id'));
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.cancel(id,Error('Native response timeout')),timeoutMs);this.pending.set(id,{resolve,reject,onProgress,timer});try{this.send({...value,id});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
 }
 health(){return this.request({op:'health'},{timeoutMs:5000});}
 search(state,{id=randomUUID(),ms=500,cores=4,maxDepth=40,diagnostics=false,onProgress=()=>{}}={}){return this.request({op:'search',id,state,ms,cores,maxDepth,diagnostics,profile:this.profile},{onProgress,timeoutMs:Math.min(30000,Math.max(1,ms))+2000});}
 cancel(id,error=Object.assign(Error('Calculation cancelled'),{name:'AbortError'})){const p=this.pending.get(id);if(p){this.pending.delete(id);clearTimeout(p.timer);p.reject(error);}if(this.child)this.send({op:'cancel',id});}
 close(){this.closed=true;const child=this.child;this.child=null;child?.kill();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error('Native process closed'),{name:'AbortError'}));}this.pending.clear();}
}
