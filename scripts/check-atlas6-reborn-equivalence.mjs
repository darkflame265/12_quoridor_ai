import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {legal} from '../src/engine.js';
import {createHash} from 'node:crypto';
const reborn=fileURLToPath(new URL('../atlas6-reborn-engine/target/release/quoridor-atlas6-reborn.exe',import.meta.url));
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
const original=new NativeProcess({executable:nativeExecutable,profile:'baseline'});
const clone=new NativeProcess({executable:reborn,profile:'baseline'});
const rows=[];
try{
 await Promise.all([original.health(),clone.health()]);
 for(const item of fixtures.slice(20,30)){
  const [a,b]=await Promise.all([original.search(item.state,{ms:500,cores:4}),clone.search(item.state,{ms:500,cores:4})]);
  if(!legal(item.state,a.pv[0])||!legal(item.state,b.pv[0]))throw Error('illegal move '+item.id);
  rows.push({id:item.id,sameAction:JSON.stringify(a.pv[0])===JSON.stringify(b.pv[0]),baseDepth:a.depth,rebornDepth:b.depth,base:a.pv[0],reborn:b.pv[0]});
  console.log(JSON.stringify(rows.at(-1)));
 }
}finally{original.close();clone.close();}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
writeFileSync('evaluation/atlas6-reborn-equivalence-20261101.json',JSON.stringify({sameSource:true,originalBuild:hash(nativeExecutable),rebornBuild:hash(reborn),ms:500,cores:4,rows},null,2)+'\n');
