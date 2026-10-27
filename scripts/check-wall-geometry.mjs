import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {wallContact} from '../evaluation/wall-geometry.mjs';
import {decode,Position} from '../src/search.js';
import {initial,legal} from '../src/engine.js';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2];if(!out)throw Error('Specify a fresh proof JSON file');
const exe=path.join('experimental-engine/target/release',process.platform==='win32'?'wall-geometry.exe':'wall-geometry'),identity=verifyMazeBuild();
const child=spawnSync(exe,[],{env:{...process.env,QUORIDOR_MAZE_GEOMETRY:'physical'},encoding:'utf-8',windowsHide:true,maxBuffer:2*1024*1024});if(child.status!==0)throw Error(child.stderr||'Geometry snapshot failed');
const data=JSON.parse(child.stdout);if(data.physicalMode!==true)throw Error('Physical dispatch is inactive');
let pairs=0,legalPairs=0,legacyMismatches=0,legalMismatches=0,legacyReflectionMismatches=0,legacyJsRustMismatches=0;
const legacyJs=new Position(initial());
const mirror=i=>(i>=64?64:0)+(Math.floor(i%64/8))*8+7-i%8;
for(let a=0;a<128;a++)for(let b=0;b<128;b++){
 const expected=Number(wallContact(decode(a+81),decode(b+81))),actual=data.counts[a][b];if(actual!==expected)throw Error(`Rust/reference mismatch ${a},${b}`);
 if(actual!==data.counts[b][a]||actual!==data.counts[mirror(a)][mirror(b)])throw Error('Contact symmetry failed');
 const state=initial();state.walls=[{...decode(b+81),owner:0}];state.left[0]=9;state.turn=1;const valid=legal(state,decode(a+81));
 legacyJs.walls.fill(0);legacyJs.walls[b]=1;legacyJsRustMismatches+=Number(legacyJs.wallConnections(a+81)!==data.legacy[a][b]);
 pairs++;legalPairs+=Number(valid);if(data.legacy[a][b]!==actual){legacyMismatches++;legalMismatches+=Number(valid);}legacyReflectionMismatches+=Number(data.legacy[a][b]!==data.legacy[mirror(a)][mirror(b)]);
}
const h=4*8+3,v=64+3*8+5,result={format:'atlas-wall-contact-proof-v1',identity,geometryBinarySha256:digest(await readFile(exe)),snapshotSha256:digest(child.stdout),referenceSha256:digest(await readFile('evaluation/wall-geometry.mjs')),pairs,legalPairs,legacyMismatches,legalMismatches,legacyReflectionMismatches,legacyJsRustMismatches,physicalReflectionMismatches:0,example:{legacy:[data.legacy[h][v],data.legacy[mirror(h)][mirror(v)]],physical:[data.counts[h][v],data.counts[mirror(h)][mirror(v)]]},productionActive:false};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pairs,legalPairs,legacyMismatches,legalMismatches,legacyReflectionMismatches,example:result.example}));
