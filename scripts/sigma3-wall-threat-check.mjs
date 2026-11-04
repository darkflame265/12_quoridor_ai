import{readFileSync,writeFileSync}from'node:fs';
import{distance,notation}from'../src/engine.js';
import{directWallThreat,unansweredTwoWallThreat}from'./sigma3-wall-threat-probe.mjs';
function arg(name,fallback){const idx=process.argv.indexOf(name);return idx<0?fallback:process.argv[idx+1];}
const file=arg('--file',null);
if(!file)throw Error('Usage: node scripts/sigma3-wall-threat-check.mjs --file evaluation/fixture.json [--id 103] [--side 0] [--two-wall] [--out report.json]');
let data=JSON.parse(readFileSync(file,'utf8'));
if(Array.isArray(data)){
 const id=arg('--id',null);
 if(id===null)throw Error('Array input requires --id');
 data=data.find(r=>String(r.id)===String(id));
 if(!data)throw Error('missing id '+id);
}
const state=data.s||data.state||data;
if(!Array.isArray(state.p)||!Array.isArray(state.walls)||!Array.isArray(state.left))throw Error('invalid state payload');
const defender=Number(arg('--side',state.turn));
if(![0,1].includes(defender))throw Error('invalid side');
const begin=performance.now();
const scan=process.argv.includes('--two-wall')
 ?unansweredTwoWallThreat(state,defender,{topK:6,secondTopK:3})
 :directWallThreat(state,defender,{topK:10});
const report={version:'sigma3-wall-threat-cli-v1',source:file,
 defender,attacker:1-defender,
 currentDistances:[distance(state,defender),distance(state,1-defender)],
 maxImmediateOwnDistanceDamage:scan.maxOwnIncrease,
 maxImmediateNetDistanceDamage:scan.maxNetDamage,
 worstImmediateWalls:scan.candidates.map(r=>({...r,notation:notation(r.action)})),
 unansweredTwoWall:scan.unansweredTwoWall?{
  ...scan.unansweredTwoWall,firstNotation:notation(scan.unansweredTwoWall.first),
  secondNotation:notation(scan.unansweredTwoWall.second)}:null,
 assumptions:scan.assumptions||'All legal next opponent walls, evaluated at current static board state; no opponent policy weighting.',
 researchOnly:true,elapsedMs:Math.round(performance.now()-begin)};
const out=arg('--out',null);
if(out)writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
