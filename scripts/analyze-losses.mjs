import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {SearchEngine,Position,ENGINE_VERSION} from '../src/search.js';
import {initial,apply,moves,notation} from '../src/engine.js';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const input=get('--report',null),ms=Number(get('--ms',500)),limit=Number(get('--limit',6));
if(!input||!Number.isFinite(ms)||ms<1||!Number.isInteger(limit)||limit<1)throw Error('Usage: npm run analyze-losses -- --report <report.json> [--ms 500] [--limit 6]');
const reportPath=path.resolve(input),base=path.dirname(reportPath),report=JSON.parse(await readFile(reportPath,'utf8')),candidates=[];
for(const summary of report.games.filter(g=>g.result==='loss')){
 const game=JSON.parse(await readFile(path.join(base,summary.file),'utf8'));let s=initial();const states=[];for(const a of game.records){states.push(s);s=apply(s,a);}
 for(let i=0;i<game.trace.length;i++){const t=game.trace[i];if(t.turn!==game.candidateSide)continue;
   const next=game.trace[i+1],swing=Number.isFinite(t.score)&&Number.isFinite(next?.score)?t.score+next.score:0;
   candidates.push({game:game.id,file:summary.file,ply:t.ply,action:t.action,state:states[t.ply],screeningSwing:swing,wasDepth:t.depth});
 }
}
candidates.sort((a,b)=>b.screeningSwing-a.screeningSwing);const selected=[],used=new Set();for(const c of candidates)if(!used.has(c.game)&&selected.length<limit){used.add(c.game);selected.push(c);}for(const c of candidates)if(selected.length<limit&&!selected.includes(c))selected.push(c);
const results=[];
await mkdir(path.join(base,'analysis','positions'),{recursive:true});
for(const c of selected){
 const e=new SearchEngine(),best=e.search(c.state,{ms}),after=apply(c.state,c.action),response=e.search(after,{ms}),playedScore=after.winner===c.state.turn?30000:-response.score;
 const same=JSON.stringify(best.pv[0])===JSON.stringify(c.action),alternative=apply(c.state,best.pv[0]),alternateResponse=same?response:e.search(alternative,{ms}),alternativeScore=alternative.winner===c.state.turn?30000:-alternateResponse.score;
 const hasImmediateWin=moves(c.state).some(a=>a.y===(c.state.turn===0?0:8));const allowedImmediateLoss=after.winner===null&&moves(after).some(a=>a.y===(after.turn===0?0:8));
 const p=new Position(c.state),ownThreat=p.wallPotential(c.state.turn,12),attack=p.wallPotential(1-c.state.turn,12);
 const classification=hasImmediateWin?'missed immediate finish':allowedImmediateLoss?'allowed immediate defeat':c.action.type==='wall'?'wall timing / wall investment':'route choice / future wall exposure';
 const game=JSON.parse(await readFile(path.join(base,c.file),'utf8')),replay=`positions/${c.game}-ply${c.ply}.json`;await writeFile(path.join(base,'analysis',replay),JSON.stringify({version:1,records:game.records.slice(0,c.ply)},null,2));
 const result={...c,replay,classification:same?'no alternative found':classification,best:{action:best.pv[0],score:best.score,depth:best.depth,pv:best.pv,exact:best.exact||false,continuationScore:alternativeScore,continuationDepth:alternateResponse.depth},played:{score:playedScore,response:response.pv,depth:response.depth},estimatedRegret:same?0:alternativeScore-playedScore,wallThreats:{ownThreat,attack},warning:'Heuristic diagnosis, not proof of a losing move. Both continuations receive the same time budget but may reach different depths.'};results.push(result);console.log(`${c.game} move ${c.ply+1}: ${notation(c.action)} -> ${notation(best.pv[0])}, estimated regret ${result.estimatedRegret}`);
}
const out={engine:ENGINE_VERSION,sourceReport:reportPath,ms,losses:report.games.filter(g=>g.result==='loss').length,analyzed:results.length,results};await mkdir(path.join(base,'analysis'),{recursive:true});await writeFile(path.join(base,'analysis','losses.json'),JSON.stringify(out,null,2));
const lines=['# Loss review','',`Source: ${reportPath}`,`Reanalysis: ${ms} ms per root and child position.`,`Heuristic diagnoses only; score differences are not proven mistakes or win percentages.`,'','| Game | Move | Played | Suggested | Category | Estimated regret |','|---|---:|---|---|---|---:|',...results.map(r=>`| ${r.game} | ${r.ply+1} | ${notation(r.action)} | ${notation(r.best.action)} | ${r.classification} | ${r.estimatedRegret} |`)];await writeFile(path.join(base,'analysis','losses.md'),lines.join('\n')+'\n');
