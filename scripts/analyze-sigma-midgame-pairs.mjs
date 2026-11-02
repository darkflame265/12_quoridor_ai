import {readFileSync,writeFileSync} from 'node:fs';
const a=JSON.parse(readFileSync('reports/sigma-selfplay/midgame-baseline2.json'));
const b=JSON.parse(readFileSync('reports/sigma-selfplay/midgame-precommit2.json'));
const stats=g=>{
 const trace=g.trace,seen=new Set(),counts=new Map();let repeats=0;
 for(const t of trace){const s=t.state;const k=JSON.stringify([s.p,s.walls,s.left,s.turn]);if(seen.has(k))repeats++;seen.add(k);
 const own=t.side+':'+s.p[t.side].x+','+s.p[t.side].y;counts.set(own,(counts.get(own)||0)+1);}
 const firstOverride=trace.find(t=>t.diagnostics?.loopDebug?.preCommitRetreat);
 return {winner:g.winner,plies:trace.length,repeatedFullPositions:repeats,maxPawnVisit:Math.max(...counts.values()),firstOverride:firstOverride?{ply:firstOverride.ply,...firstOverride.diagnostics.loopDebug.preCommitRetreat}:null,firstSix:trace.slice(0,6).map(t=>t.action),lastDistance:trace.at(-1)?.pathAfter};
};
const results={scope:'continuous midgame rollouts from exact saved state following ply 22; 80 future plies cap; no claim of draw',base:a.completed.map(stats),experimental:b.completed.map(stats)};
writeFileSync('evaluation/sigma2-midgame-paired-results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
