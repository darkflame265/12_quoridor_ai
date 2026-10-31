import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {leaseOwner,removeUnchangedLease} from './play-lock.mjs';
const root='C:/12_quoridor_ai',state={pid:123,processStartedAt:10000};
const info={name:'node.exe',commandLine:'node "C:\\12_quoridor_ai\\scripts\\play.mjs"',startedAt:10000};
test('a recycled inaccessible Windows system PID is stale, not a launcher',async()=>{
 assert.equal(await leaseOwner(state,{root,probe:()=>{throw Object.assign(Error(),{code:'EPERM'});},inspect:async()=>({name:'svchost.exe',startedAt:20000})}),'mismatch');
});
test('node PID reuse and unrelated node commands are rejected; the current launcher is retained',async()=>{
 const options={root,probe:()=>{},inspect:async()=>info};
 assert.equal(await leaseOwner(state,options),'owned');
 assert.equal(await leaseOwner({...state,processStartedAt:1},{...options,inspect:async()=>({...info,startedAt:20000})}),'mismatch');
 assert.equal(await leaseOwner(state,{...options,inspect:async()=>({...info,commandLine:'node another-project/server.js'})}),'mismatch');
 assert.equal(await leaseOwner({pid:123},{...options,inspect:async()=>({...info,commandLine:'node scripts/play.mjs'})}),'owned');
 assert.equal(await leaseOwner(state,{...options,inspect:async()=>null}),'unknown');
});
test('dead processes are stale without a metadata query',async()=>{
 assert.equal(await leaseOwner(state,{probe:()=>{throw Object.assign(Error(),{code:'ESRCH'});},inspect:async()=>{throw Error('must not run');}}),'dead');
});
test('cleanup serializes contenders and cannot delete a replacement lease',async t=>{
 const base=path.resolve('native-engine/target'),folder=await mkdtemp(path.join(base,'play-lock-test-')),file=path.join(folder,'running.json');
 t.after(async()=>{assert(folder.startsWith(base+path.sep));await rm(folder,{recursive:true,force:true});});
 const stale={pid:1,phase:'starting'},fresh={pid:2,phase:'ready'};
 await writeFile(file,JSON.stringify(stale));const results=await Promise.all([removeUnchangedLease(file,stale),removeUnchangedLease(file,stale)]);assert.equal(results.filter(Boolean).length,1);
 await writeFile(file,JSON.stringify(fresh));assert.equal(await removeUnchangedLease(file,stale),false);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),fresh);
});
