import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function assessAtlas6(report,{opponent=report.opponent}={}){
 const requirements={atlas53:0.60,atlas04:0.65};
 const target=requirements[opponent];
 const games=report.results??[];
 const total=games.length;
 const weighted=total?(report.wins+report.draws/2)/total:0;
 const pairs=new Map();
 for(const game of games){
  const bySide=pairs.get(game.fixture)??new Set();
  bySide.add(game.atlasSide);pairs.set(game.fixture,bySide);
 }
 const balanced=[...pairs.values()].every(sides=>sides.size===2) &&
   games.filter(g=>g.atlasSide===0).length===games.filter(g=>g.atlasSide===1).length;
 // Treating draws as non-wins makes this a conservative confidence bound.
 const n=total,p=n?report.wins/n:0,z=1.96;
 const lower=n?(p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n):0;
 const checks={
  supportedOpponent:target!==undefined,
  enoughGames:total>=200,
  distinctOpenings:pairs.size>=90,
  balancedCohort:report.fixtureFilePath==='evaluation/atlas6-balanced-openings.json',
  balancedSides:balanced,
  finalized:report.finished===total && report.gamesRequested===total,
  validResults:games.every(g=>['win','loss','draw'].includes(g.verdict)&&
    Number.isInteger(g.plies)&&g.plies>=0&&g.plies<=200&&
    ['goal','ply-cap','threefold-repetition'].includes(g.reason)),
  consistentTotals:report.wins+report.losses+report.draws+(report.undecided??0)===total,
  allDecisive: (report.undecided??0)===0,
  fairTime:report.ms===500&&report.cores===4&&report.maxPlies===200,
  timeoutRate:report.moves>0&&report.overruns/report.moves<0.01,
  targetScore:weighted>=(target??1),
  conservativeConfidence:lower>0.5,
  reproducibleBuild:typeof report.engineBuild==='string'&&report.engineBuild.length===64 &&
    typeof report.opponentBuild==='string'&&report.opponentBuild.length===64,
 };
 return {eligible:Object.values(checks).every(Boolean),opponent,score:weighted,
  conservativeWinLower:lower,wins:report.wins,losses:report.losses,draws:report.draws,
  games:total,uniqueOpenings:pairs.size,checks,
  caveat:'Not a proof of winning against all humans or all engines.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node evaluation/atlas6-release-gate.mjs <report.json>');
 const report=JSON.parse(readFileSync(file,'utf8'));
 const result=assessAtlas6(report);
 console.log(JSON.stringify(result,null,2));
 process.exitCode=result.eligible?0:2;
}
