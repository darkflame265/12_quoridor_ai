import {readFileSync,writeFileSync} from 'node:fs';
import {distance} from '../src/engine.js';
const source=process.argv[2]??'reports/sigma-selfplay/sigma2-reviewed-policy20.json';
const report=JSON.parse(readFileSync(source,'utf8'));
const groups={sigma2First:{wins:0,losses:0,cutoffs:0},sigma2Second:{wins:0,losses:0,cutoffs:0}};
const games=[];
for(const g of report.completed){
 const s2=g.index%2,group=groups[s2===0?'sigma2First':'sigma2Second'];
 if(g.winner===null)group.cutoffs++;else if(g.winner===s2)group.wins++;else group.losses++;
 const repeatedPawnMoves=g.trace.reduce((n,t,i)=>n+(i>=4&&t.action.type==='move'&&g.trace[i-4].action.type==='move'&&t.side===g.trace[i-4].side&&t.action.x===g.trace[i-4].action.x&&t.action.y===g.trace[i-4].action.y?1:0),0);
 const firstWall=g.trace.find(t=>t.action.type==='wall');
 const turns=g.trace.filter(t=>t.side===s2);
 const key=p=>p.x+','+p.y;
 const visited=new Set();let ownBacktracks=0;
 for(const t of turns){const k=key(t.state.p[s2]);if(visited.has(k))ownBacktracks++;visited.add(k);}
 games.push({index:g.index,sigma2Side:s2,winner:g.winner,plies:g.plies,firstWallPly:firstWall?.ply+1??null,repeatedPawnMoves,ownRepeatedSquareStates:ownBacktracks,finalDistance:g.trace.at(-1).pathAfter,firstFour:g.trace.slice(0,4).map(x=>x.action)});
}
const openings=new Map();
for(const g of games){let k=JSON.stringify(g.firstFour);openings.set(k,(openings.get(k)||0)+1);}
const output={source,groups,firstPlayerWins:games.filter(g=>g.winner===0).length,secondPlayerWins:games.filter(g=>g.winner===1).length,openingPatterns:[...openings].map(([moves,count])=>({moves:JSON.parse(moves),count})),games};
writeFileSync('evaluation/sigma2-side-and-opening-review.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({groups,firstPlayerWins:output.firstPlayerWins,secondPlayerWins:output.secondPlayerWins,openingPatterns:output.openingPatterns,topLoops:games.toSorted((a,b)=>b.repeatedPawnMoves-a.repeatedPawnMoves).slice(0,5)},null,2));
