import {initial,apply,legal,moves} from '../src/engine.js';
import {Position,decode} from '../src/search.js';
export const SPLITS={development:137031,validation:672041,holdout:984127};
export function rotate(state){const s=structuredClone(state);s.p=state.p.map(p=>({x:8-p.x,y:8-p.y})).reverse();s.left.reverse();s.turn=1-s.turn;s.winner=s.winner===null?null:1-s.winner;s.walls=s.walls.map(w=>({...w,x:7-w.x,y:7-w.y,owner:w.owner===undefined?undefined:1-w.owner}));return s;}
export function openings(split='development',count=8){
 if(!(split in SPLITS))throw Error('Unknown split');let seed=SPLITS[split];const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const out=[];
 for(let i=0;i<count;i++){
  let s=initial();const records=[],style=['standard','race','mixed','wall-maze'][i%4],plies=i===0?0:4+2*(i%7);
  for(let j=0;j<plies&&s.winner===null;j++){
   const p=new Position(s);let actions=p.actions();if(style==='race'||style==='mixed'&&j%3!==0)actions=actions.filter(a=>a<81);else if(style==='wall-maze')actions=actions.filter(a=>a>=81);
   if(!actions.length)actions=p.actions();let a=decode(actions[random()%actions.length]);
   // Racing openings move towards the goal but still vary files.
   if(style==='race'){const forward=moves(s).filter(m=>s.turn===0?m.y<=s.p[0].y:m.y>=s.p[1].y);a=forward[random()%forward.length];}
   if(!legal(s,a))throw Error('Invalid generated opening');records.push(a);s=apply(s,a);
  }
  if(s.winner!==null){i--;continue;}out.push({id:`${split}-${i}`,style,records,state:s});
 }return out;
}
export function tactics(){
 const cases=[];for(const side of [0,1]){
  let s=initial();s.p=[{x:0,y:1},{x:8,y:5}];cases.push({id:`finish-${side}`,state:side?rotate(s):s,expect:'win-now'});
  s=initial();s.p=[{x:4,y:2},{x:4,y:1}];cases.push({id:`jump-${side}`,state:side?rotate(s):s,expect:'win-now'});
  s=initial();s.p=[{x:0,y:5},{x:4,y:7}];cases.push({id:`defend-${side}`,state:side?rotate(s):s,expect:'prevent-loss'});
  s=initial();s.p=[{x:4,y:2},{x:4,y:1}];s.walls=[{type:'wall',x:4,y:0,o:'h',owner:1}];s.left[1]=9;cases.push({id:`diagonal-${side}`,state:side?rotate(s):s,expect:'legal'});
  s=initial();s.p=[{x:4,y:1},{x:4,y:0}];cases.push({id:`diagonal-finish-${side}`,state:side?rotate(s):s,expect:'win-now'});
  s=initial();s.p=[{x:4,y:7},{x:4,y:6}];cases.push({id:`defend-jump-${side}`,state:side?rotate(s):s,expect:'prevent-loss'});
  s=initial();s.p=[{x:0,y:1},{x:8,y:7}];s.left=[1,1];cases.push({id:`finish-before-defense-${side}`,state:side?rotate(s):s,expect:'win-now'});
  s=initial();s.left=[0,3];s.p=[{x:0,y:4},{x:8,y:4}];cases.push({id:`no-wall-resource-${side}`,state:side?rotate(s):s,expect:'legal'});
 }return cases;
}
export function checkTactic(fixture,action){const s=fixture.state;if(!action||!legal(s,action))return false;const n=apply(s,action);if(fixture.expect==='win-now')return n.winner===s.turn;if(fixture.expect==='prevent-loss')return n.winner===s.turn||!moves(n).some(m=>m.y===(n.turn===0?0:8));return true;}
export function wilson(wins,losses){const n=wins+losses;if(!n)return [0,1];const z=1.96,p=wins/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
