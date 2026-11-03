import{legal,apply}from'../src/engine.js';
export function createRng(seed){let x=seed|0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
export function chooseVaried(state,result,rng,{probability=0.35}={}){
 const base=result.pv?.[0];if(!base||!legal(state,base))throw Error('invalid search decision');
 if(apply(state,base).winner!==null)return {action:base,diverted:false,eligible:0};
 const children=result.diagnostics?.rootChildren||[];
 const head=children[0];if(!head||!head.visits)return {action:base,diverted:false,eligible:0};
 const options=children.slice(1,6).filter(c=>c.visits>=Math.max(7,head.visits*0.17)&&
     c.qFromRoot!==null&&head.qFromRoot!==null&&c.qFromRoot>=head.qFromRoot-0.25&&
     legal(state,c.action)&&JSON.stringify(c.action)!==JSON.stringify(base));
 const draw=rng();
 if(!options.length||draw>=probability)return {action:base,diverted:false,eligible:options.length};
 const pick=options[Math.min(options.length-1,Math.floor(draw/probability*options.length))].action;
 return {action:pick,diverted:true,eligible:options.length};
}
