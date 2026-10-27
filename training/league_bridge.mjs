import readline from 'node:readline';
import {readFileSync} from 'node:fs';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {activeNativeProfile,nativeSourceHash,nativeSources,digest} from '../evaluation/native-policy.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {tactics,checkTactic} from '../evaluation/suite.js';
import {initial,apply,legal} from '../src/engine.js';
const profile=activeNativeProfile();
if(profile!=='candidate')throw Error('Approved Atlas 5.3 is unavailable; rebuild and verify the native release first');
const manifest=JSON.parse(readFileSync('native-engine/target/release/source-manifest.json'));
if(nativeSources.some(f=>manifest.sources[f]!==digest(readFileSync(f))))throw Error('Native executable is stale');
const identity={sourceHash:nativeSourceHash(),binaryHash:digest(readFileSync(nativeExecutable)),releaseHash:digest(readFileSync('evaluation/native-release.json')),profile,name:'Atlas 5.3 Native Rust'};
let native=new NativeProcess({profile});
try{for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const r=JSON.parse(line);let out;
  if(r.op==='identity'){await native.health();if(identity.sourceHash!==nativeSourceHash()||identity.binaryHash!==digest(readFileSync(nativeExecutable))||identity.releaseHash!==digest(readFileSync('evaluation/native-release.json')))throw Error('Native inputs changed');out=identity;}
  else if(r.op==='reset'){native.close();native=new NativeProcess({profile});await native.health();out={ok:true};}
  else if(r.op==='opening')out=nativeFixtures(r.split,r.suite,r.index+1,'v3')[r.index];
  else if(r.op==='search')out=await native.search(r.state,{ms:r.ms,cores:r.cores});
  else if(r.op==='tactics')out=tactics();
  else if(r.op==='checkTactic')out={pass:checkTactic(tactics().find(f=>f.id===r.id),r.action)};
  else if(r.op==='validate'){let state=initial();for(const action of r.records){if(!legal(state,action))throw Error('Illegal league action');state=apply(state,action);}out={state};}
  else throw Error('Unknown league operation');
  process.stdout.write(JSON.stringify(out)+'\n');
 }catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');}
}}finally{native.close();}
