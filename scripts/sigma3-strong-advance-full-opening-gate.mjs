import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const src='evaluation/sigma3-strong-advance-full-opening-20.json';
const d=JSON.parse(readFileSync(src,'utf8'));
assert.equal(d.totalGames,20);
assert.equal(d.games.length,20);
const paired=[];
for(let opening=0;opening<5;opening++)for(let side=0;side<=1;side++){const pair=d.games.filter(g=>JSON.stringify(g.opening)===JSON.stringify(d.games[opening*4].opening)&&g.side===side);assert.equal(pair.length,2);assert.deepEqual(pair.map(g=>g.arm).sort(),['base','guard']);assert.deepEqual(pair[0].opening,pair[1].opening);paired.push({opening,side,base:pair.find(x=>x.arm==='base'),guard:pair.find(x=>x.arm==='guard')});}
const wins=arm=>paired.filter(p=>p[arm].rootWon).length;
const summary={version:'sigma3-full-opening-balanced-promotion-gate-v1',status:'experimental-only',source:src,completed:d.games.length,startingOpenings:new Set(paired.map(p=>JSON.stringify(p.base.opening))).size,sideCounts:[0,1].map(side=>paired.filter(p=>p.side===side).length),baseline:{wins:wins('base'),losses:10-wins('base')},guard:{wins:wins('guard'),losses:10-wins('guard')},improved:paired.filter(p=>!p.base.rootWon&&p.guard.rootWon).map(p=>({opening:p.opening,side:p.side})),regressed:paired.filter(p=>p.base.rootWon&&!p.guard.rootWon).map(p=>({opening:p.opening,side:p.side})),cutoffs:d.games.filter(g=>g.cutoff).length,changed:d.games.filter(g=>g.arm==='guard').reduce((n,g)=>n+g.overrides,0),averageTacticalExtraMs:d.games.filter(g=>g.arm==='guard').reduce((n,g)=>n+g.extraMs,0)/d.games.filter(g=>g.arm==='guard').reduce((n,g)=>n+g.sigmaMoves,0),bothSidesGuardWins:[0,1].map(side=>paired.filter(p=>p.side===side&&p.guard.rootWon).length)};
summary.promote=false;
summary.reason='Only five distinct scripted openings and 10 paired full games; cannot establish general superiority or controlled latency. Hold separate production integration until broader diverse, paired evaluation.';
writeFileSync('evaluation/sigma3-strong-advance-full-opening-gate.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));