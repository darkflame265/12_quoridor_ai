import {readFileSync,writeFileSync} from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/sigma3-promotion-gate.mjs <tournament-report.json> [output.json]');
const report=JSON.parse(readFileSync(file,'utf8'));
if(!String(report.version).includes('sigma2-vs-sigma3'))throw Error('not a Sigma2/Sigma3 comparison');
const games=report.completed||[];
const decisive=games.filter(g=>g.winnerVariant==='sigma3'||g.winnerVariant==='sigma2');
const sigma3Wins=decisive.filter(g=>g.winnerVariant==='sigma3').length;
const sigma2Wins=decisive.filter(g=>g.winnerVariant==='sigma2').length;
const uniqueHashes=new Set(games.map(g=>g.hash)).size;
const cutoffs=games.filter(g=>g.cutoff).length;
const planned=Number(report.gamesRequested||report.games||report.totalGames||games.length);
const complete=planned>=20&&games.length===planned;
const sufficientDiversity=uniqueHashes>=Math.ceil(games.length*0.8);
const better=decisive.length===games.length&&sigma3Wins>sigma2Wins;
const sideWins=[0,1].map(side=>games.filter(g=>g.winnerVariant==='sigma3'&&g.winner===side).length);
const promoted=complete&&sufficientDiversity&&better&&cutoffs===0&&sideWins.every(x=>x>=3);
const result={source:file,status:promoted?'eligible-for-manual-review':'do-not-promote',
 planned,completed:games.length,sigma3Wins,sigma2Wins,decisive:decisive.length,
 winRate:decisive.length?sigma3Wins/decisive.length:null,
 uniqueHashes,cutoffs,sigma3WinsByBoardSide:sideWins,
 conditions:{complete,sufficientDiversity,better,noCutoffs:cutoffs===0,
 bothSidesProven:sideWins.every(x=>x>=3)},
 note:'A conservative verification gate, not statistical proof. Requires independent paired-seed evaluation.'};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(!promoted)process.exitCode=2;
