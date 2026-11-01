import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const source=process.argv[2]??'reports/sigma-selfplay/sigma1-vs-sigma1.json';
const target=process.argv[3]??'evaluation/sigma-selfplay-summary.json';
const report=JSON.parse(readFileSync(source,'utf8'));
const games=report.completed;
const hashCounts=new Map();
const stats={source,version:report.version,requested:report.gamesRequested,completed:games.length,uniqueGames:0,duplicates:0,winners:{side0:0,side1:0,undecided:0},winnerVariants:{sigma1:0,sigma2:0},averagePlies:0,wallsUsed:[0,0],wallImpact:{positive:0,neutral:0,negative:0},tacticalPositions:0,selectedWithoutMostVisits:0,opponentOneMoveFromGoal:0,hotspots:[]};
let totalPlies=0;const hotspots=[];
for(const game of games){
 hashCounts.set(game.hash,(hashCounts.get(game.hash)??0)+1);
 stats.winners[game.winner===null?'undecided':game.winner===0?'side0':'side1']++;
 if(game.winnerVariant)stats.winnerVariants[game.winnerVariant]++;
 totalPlies+=game.plies;
 for(const turn of game.trace){
  if(turn.action.type==='wall'){
   stats.wallsUsed[turn.side]++;
   const own=turn.side,other=1-own;
   const enemyGain=turn.pathAfter[other]-turn.pathBefore[other];
   const ownCost=turn.pathAfter[own]-turn.pathBefore[own];
   stats.wallImpact[enemyGain>ownCost?'positive':enemyGain===ownCost?'neutral':'negative']++;
  }
  const choices=turn.diagnostics?.topCandidates??[];
  const best=choices.reduce((a,b)=>!a||b.visits>a.visits?b:a,null);
  if(best&&JSON.stringify(best.action)!==JSON.stringify(turn.action))stats.selectedWithoutMostVisits++;
  const opponent=1-turn.side,goal=opponent===0?0:8;
  if(Math.abs(turn.state.p[opponent].y-goal)===1){
   stats.opponentOneMoveFromGoal++;
   hotspots.push({game:game.index,ply:turn.ply,side:turn.side,action:turn.action,opponentDistance:turn.pathBefore[opponent],candidateMoves:choices.slice(0,4)});
  }
  if(Math.abs(turn.pathBefore[0]-turn.pathBefore[1])>=5)stats.tacticalPositions++;
 }
}
stats.uniqueGames=hashCounts.size;stats.duplicates=games.length-hashCounts.size;
stats.averagePlies=games.length?Number((totalPlies/games.length).toFixed(2)):0;
stats.hotspots=hotspots.slice(0,30);
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify({...stats,hotspots:stats.hotspots.length},null,2));
