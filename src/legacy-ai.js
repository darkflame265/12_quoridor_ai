import {candidates,evaluate} from './engine.js';
export function legacySearch(state,ms){
 let nodes=0,deadline=performance.now()+ms;
 function search(s,depth,alpha,beta,ply){nodes++;if(performance.now()>deadline)throw Error('timeout');if(s.winner!==null)return {score:-10000+ply,pv:[]};if(!depth)return {score:evaluate(s),pv:[]};let best={score:-Infinity,pv:[]};const list=candidates(s),limit=ply===0?list.length:Math.max(8,20-ply*3);for(const {a,s:n} of list.slice(0,limit)){const v=search(n,depth-1,-beta,-alpha,ply+1),score=-v.score;if(score>best.score)best={score,pv:[a,...v.pv]};alpha=Math.max(alpha,score);if(alpha>=beta)break;}return best;}
 const list=candidates(state);if(!list.length)return {pv:[],nodes,depth:0};let result={score:list[0].score,pv:[list[0].a]},depth=0;for(let d=1;d<=20;d++){try{result=search(state,d,-Infinity,Infinity,0);depth=d;if(Math.abs(result.score)>9000)break;}catch{break;}}return {...result,depth,nodes};
}
