import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {SearchEngine,Position,ENGINE_VERSION} from '../src/search.js';
import {SearchEngine as Atlas2} from '../src/baselines/atlas2.js';
import {initial,apply,legal} from '../src/engine.js';
import {legacySearch} from '../src/legacy-ai.js';
import {openings,tactics,checkTactic,wilson,SPLITS} from '../evaluation/suite.js';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const ms=Number(get('--ms',150)),pairs=Number(get('--pairs',8)),maxPlies=Number(get('--max-plies',160)),split=get('--split','development'),opponent=get('--opponent','atlas2');
if(!['atlas2','legacy','shortest'].includes(opponent)||!(split in SPLITS)||!Number.isFinite(ms)||ms<1||!Number.isInteger(pairs)||pairs<1||pairs>100||!Number.isInteger(maxPlies)||maxPlies<1)throw Error('Invalid evaluation options');
const out=path.resolve(get('--out',`reports/eval-${split}-${opponent}-${Date.now()}`));
try{await readFile(path.join(out,'report.json'));throw Error('Output already contains a report; use a fresh directory to preserve evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});await mkdir(path.join(out,'games'),{recursive:true});
const hash=createHash('sha256').update(await readFile(new URL('../src/search.js',import.meta.url))).digest('hex');
const report={version:1,status:'running',engine:ENGINE_VERSION,opponent,sourceHash:hash,date:new Date().toISOString(),ms,split,seed:SPLITS[split],pairs,maxPlies,notes:'Paired colors. The standard opening is a common anchor across splits. Repetition (3) and ply cap are benchmark adjudication only. Draws are not wins. Scores are from the side to move; heuristic scores are not win probabilities.',tactics:[],games:[],summary:{wins:0,losses:0,draws:0,candidate:{moves:0,nodes:0,elapsedMs:0,overruns:0},opponent:{moves:0,nodes:0,elapsedMs:0,overruns:0}}};
async function save(){report.summary.decisiveWilson95=wilson(report.summary.wins,report.summary.losses);report.summary.paired=report.games.reduce((acc,g)=>{acc[g.openingStyle]??={wins:0,losses:0,draws:0};acc[g.openingStyle][g.result==='win'?'wins':g.result==='loss'?'losses':'draws']++;return acc;},{});await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 const s=report.summary,ci=s.decisiveWilson95.map(n=>(n*100).toFixed(1)+'%').join('–');
 await writeFile(path.join(out,'SUMMARY.md'),`# ${ENGINE_VERSION} vs ${opponent}\n\nSplit: ${split}; seed ${report.seed}; budget ${ms} ms per move.\n\n**${s.wins} wins / ${s.losses} losses / ${s.draws} draws.** Decisive-game Wilson interval: ${ci}. Paired games are correlated, so this interval is descriptive, not an independent-game significance test.\n\nTactics: ${report.tactics.filter(t=>t.pass).length}/${report.tactics.length}.\n\n| Opening style | Wins | Losses | Draws |\n|---|---:|---:|---:|\n${Object.entries(s.paired).map(([style,v])=>`| ${style} | ${v.wins} | ${v.losses} | ${v.draws} |`).join('\n')}\n\nThreefold repetition and ply caps are evaluation conventions. Heuristic scores are not win probabilities. All games are retained in games/ and can be imported into the app.\n\nSource SHA-256: ${hash}\n`);
}
for(const f of tactics()){const r=new SearchEngine().search(f.state,{ms:Math.max(300,ms)});report.tactics.push({id:f.id,expect:f.expect,pass:checkTactic(f,r.pv[0]),action:r.pv[0],depth:r.depth});}await save();
const mirroredOrders=[0,1];
for(const opening of openings(split,pairs))for(const candidateSide of mirroredOrders){
 const candidate=new SearchEngine(),reference=new Atlas2();let s=structuredClone(opening.state),records=[...opening.records],seen=new Map(),winner=null,reason='ply cap';const trace=[];
 for(let ply=0;ply<maxPlies;ply++){
  const sig=new Position(s).signature(),occurrences=(seen.get(sig)||0)+1;seen.set(sig,occurrences);if(occurrences>=3){reason='threefold repetition';break;}
  const isCandidate=s.turn===candidateSide,start=performance.now();let r;
  if(isCandidate)r=candidate.search(s,{ms});else if(opponent==='atlas2')r=reference.search(s,{ms});else if(opponent==='legacy')r=legacySearch(s,ms);else{const p=new Position(s),t=p.turn;const list=p.pawnMoves().map(a=>{const u=p.make(a),d=p.distances(t,true);p.unmake(u);return {a,d};}).sort((a,b)=>a.d-b.d||a.a-b.a);const a=list[0].a;r={pv:[{type:'move',x:a%9,y:a/9|0}],nodes:list.length,depth:1};}
  const elapsedMs=performance.now()-start,action=r.pv[0];if(!action||!legal(s,action))throw Error(`Illegal ${isCandidate?'candidate':'opponent'} action`);
  const stats=report.summary[isCandidate?'candidate':'opponent'];stats.moves++;stats.nodes+=r.nodes;stats.elapsedMs+=elapsedMs;if(elapsedMs>ms*1.2+5)stats.overruns++;
  trace.push({ply:records.length,turn:s.turn,engine:isCandidate?ENGINE_VERSION:opponent,action,score:r.score,depth:r.depth,exact:r.exact||false,nodes:r.nodes,elapsedMs,pv:r.pv});records.push(action);s=apply(s,action);
  if(s.winner!==null){winner=s.winner;reason='goal reached';break;}
 }
 const result=winner===null?'draw':winner===candidateSide?'win':'loss',id=`${opening.id}-side${candidateSide}`,file=`games/${id}.json`;
 const game={version:1,id,openingId:opening.id,openingStyle:opening.style,openingPlies:opening.records.length,candidateSide,result,reason,winner,records,trace};
 // Validate the entire saved game through the independent public engine before persisting.
 let replay=initial();for(const a of records){if(!legal(replay,a))throw Error('Replay validation failed');replay=apply(replay,a);}
 await writeFile(path.join(out,file),JSON.stringify(game,null,2));report.games.push({id,file,result,reason,candidateSide,openingStyle:opening.style,plies:records.length});report.summary[result==='win'?'wins':result==='loss'?'losses':'draws']++;await save();
 console.log(`${id}: ${result}, ${reason}, ${records.length} plies`);
}
report.status='completed';await save();console.log(JSON.stringify({out,summary:report.summary,tactics:report.tactics.filter(t=>t.pass).length+'/'+report.tactics.length},null,2));
