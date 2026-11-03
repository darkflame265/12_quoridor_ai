import {readFileSync,writeFileSync} from 'node:fs';
const pairs=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-attack-isolated-48.json','utf8'));
const scan=JSON.parse(readFileSync('evaluation/sigma3-attack-three-turn-scan.json','utf8'));
const c=pairs.results.filter(r=>!r.enabled),e=pairs.results.filter(r=>r.enabled);
const summarize=a=>({games:a.length,sigma3Wins:a.filter(r=>r.winnerVariant==='sigma3').length,sigma2Wins:a.filter(r=>r.winnerVariant==='sigma2').length,cutoffs:a.filter(r=>r.cutoff).length,proofInterventions:a.reduce((s,r)=>s+r.proofs.length,0),avgSigma3Ms:Math.round(a.reduce((s,r)=>s+(r.avgMs[1]||0),0)/a.length)});
const differences=c.map((r,i)=>({fixture:r.fixture,side:r.sigma3Side,base:r.winnerVariant,experiment:e[i].winnerVariant,basePlies:r.plies,experimentPlies:e[i].plies,proofs:e[i].proofs})).filter(r=>r.base!==r.experiment||r.basePlies!==r.experimentPlies||r.proofs.length);
const review={
 version:'sigma3-offensive-forced-goal-review-v1',
 date:'2026-11-03',hypothesis:'Exact wall-first or pawn-first forced pawn goal in next 1-3 own turns, fully adversarial opponent reply enumeration',
 defaultEnabled:false,flag:'SIGMA3_ATTACK_PROOF=1',scope:'Sigma3 only; Sigma2 unchanged; 200 PUCT simulations remain',
 conditions:'Two-own-turn pawn-goal proof allows any legal opponent replies; three-own-turn proof requires opponent with zero walls, second own action restricted to pawn moves, all opponent replies exhaustive',
 historicalScan:{tested:scan.tested,proved:scan.cases.length,selectedDifferent:scan.cases.filter(r=>r.changed).length,provedWallStarts:scan.cases.filter(r=>r.attack.type==='wall').length},
 syntheticWallFirstFixture:{player1Internal:{x:4,y:6},player2Internal:{x:0,y:1},remainingWalls:[1,0],rootAction:'horizontal wall at (0,0) internal',result:'Proven win in three own turns, versus any legal enemy reply',note:'Designed engine-state unit test, not claimed reachable match history'},
 tournament:{fixtures:pairs.fixtures,control:summarize(c),experiment:summarize(e),winnerOrLengthDifferences:differences,isolatedEngineProcessPerGame:true,seedControlled:true,exploration:0},
 conclusion:'Opt-in experimental solver is validated but not promoted; no measured sigma3 win-rate improvement in selected late-game fixtures',
 limitations:['12 positions are derived from historical Sigma2 matches and are not an independent representative game distribution','All selected fixtures are late-game, frequently already winning for one side','The three-turn proof only applies when opponent has zero remaining walls','No proof that the new root move is superior in intermediate phases','Absence of proof does not mean an action is bad','Historical scan samples repeated game sequences']
};
writeFileSync('evaluation/sigma3-attack-review.json',JSON.stringify(review,null,2));
console.log(JSON.stringify({control:review.tournament.control,experimental:review.tournament.experiment,scan:review.historicalScan,changedPairs:differences.length},null,2));
