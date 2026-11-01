import {NativeProcess} from '../server/native-process.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const executable=fileURLToPath(new URL('../atlas6-reborn-engine/target/release/quoridor-atlas6-reborn.exe',import.meta.url));
const state=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'))[20].state;
for(const diagnostics of [false,true]){
 const client=new NativeProcess({executable,profile:'reborn'});
 try{
  const result=await client.search(state,{ms:500,cores:4,diagnostics});
  if(Boolean(result.rootDiagnostics)!==diagnostics)throw Error('diagnostics mismatch '+diagnostics);
  console.log(JSON.stringify({diagnostics,depth:result.depth,nodes:result.nodes,elapsedMs:result.elapsedMs,rootCandidates:result.rootDiagnostics?.scores.length??0}));
 }finally{client.close();}
}
