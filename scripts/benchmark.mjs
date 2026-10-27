import {initial,apply,legal} from '../src/engine.js';
import {SearchEngine,Position,decode,ENGINE_VERSION} from '../src/search.js';
import {legacySearch} from '../src/legacy-ai.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=(name,fallback)=>Number(args[args.indexOf(name)+1])||fallback;
const ms=arg('--ms',100),pairs=arg('--pairs',4),maxPlies=arg('--max-plies',160);
let seed=arg('--seed',20261027);const sourceHash=createHash('sha256').update(await readFile(new URL('../src/search.js',import.meta.url))).digest('hex');const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const report={sourceHash,date:new Date().toISOString(),ms,pairs,maxPlies,seed,engines:[ENGINE_VERSION,'legacy'],notes:'Draw adjudication: threefold position repetition or ply cap. This is an evaluation convention, not an added game rule. Paired games share an opening and swap engines between colors.',games:[],summary:{atlasWins:0,legacyWins:0,draws:0,atlasNodes:0,legacyNodes:0,atlasMs:0,legacyMs:0,atlasMoves:0,legacyMoves:0}};
for(let pair=0;pair<pairs;pair++){
 let opening=initial(),prefix=[];
 // Pair 0 starts normally; others cover midgame wall layouts and movement.
 for(let i=0;i<pair*4;i++){const p=new Position(opening),list=p.actions(),a=decode(list[random()%list.length]);if(!legal(opening,a))throw Error('opening legality');prefix.push(a);opening=apply(opening,a);}
 for(let atlasSide=0;atlasSide<2;atlasSide++){
  const engine=new SearchEngine();let s=structuredClone(opening),records=[...prefix],seen=new Map(),reason='ply cap',winner=null,depths=[];
  for(let ply=0;ply<maxPlies;ply++){
   const sig=new Position(s).signature(),count=(seen.get(sig)||0)+1;seen.set(sig,count);if(count>=3){reason='threefold repetition';break;}
   const atlas=s.turn===atlasSide,start=performance.now(),r=atlas?engine.search(s,{ms}):legacySearch(s,ms),elapsed=performance.now()-start,a=r.pv[0];
   if(!a||!legal(s,a))throw Error(`illegal ${atlas?'Atlas':'legacy'} action ${JSON.stringify(r)}`);
   const tag=atlas?'atlas':'legacy';report.summary[`${tag}Nodes`]+=r.nodes;report.summary[`${tag}Ms`]+=elapsed;report.summary[`${tag}Moves`]++;if(atlas)depths.push(r.depth);
   records.push(a);s=apply(s,a);if(s.winner!==null){winner=s.winner;reason='goal reached';break;}
  }
  const result=winner===null?'draw':winner===atlasSide?'atlas':'legacy';report.summary[result==='draw'?'draws':result==='atlas'?'atlasWins':'legacyWins']++;
  report.games.push({pair,atlasSide,result,reason,plies:records.length,meanAtlasDepth:depths.reduce((a,b)=>a+b,0)/depths.length,records});
  console.log(`Pair ${pair+1}, Atlas ${atlasSide===0?'first':'second'}: ${result} (${reason}, ${records.length} plies)`);
 }
}
await mkdir('reports',{recursive:true});await writeFile('reports/benchmark-latest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));
