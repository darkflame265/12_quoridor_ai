import {legalActions,encodePosition,policyIndex,geometry,positionKey,apply} from './browser-position.js';
const aborted=()=>Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
const node=(state,parent=null,action=null,prior=1)=>({state,parent,action,prior,visits:0,total:0,children:null});
const q=n=>n.visits?n.total/n.visits:0;
export async function searchBrowser(state,evaluate,{ms=500,engine='sigma2',cancelled=()=>false,now=()=>performance.now(),maxSimulations=200}={}){
 const started=now(),deadline=started+ms,root=node({p:state.p,walls:state.walls,left:state.left,turn:state.turn,winner:state.winner}),history=new Set((state.historyStates??[]).map(positionKey));let evaluations=0,depth=0;
 const expand=async n=>{
  const actions=legalActions(n.state);if(!actions.length)return 0;
  const r=await evaluate(encodePosition(n.state));evaluations++;
  if(cancelled())throw aborted();
  const logits=actions.map(a=>r.policy[policyIndex(n.state,a)]),high=Math.max(...logits),weights=logits.map(x=>Math.exp(x-high)),sum=weights.reduce((a,b)=>a+b,0);
  n.children=actions.map((a,i)=>node(null,n,a,weights[i]/sum));return r.value;
 };
 const rootValue=await expand(root);root.visits=1;root.total=rootValue;
 let simulations=0;
 while(simulations<maxSimulations&&now()<deadline){
  if(cancelled())throw aborted();let n=root,plies=0,seen=new Set(),value=0;
  while(true){
   const key=positionKey(n.state);if(seen.has(key)||(n!==root&&history.has(key))){value=0;break;}seen.add(key);
   if(n.state.winner!==null){value=n.state.winner===n.state.turn?1:-1;break;}
   if(!n.children){value=await expand(n);break;}
   if(!n.children.length){value=0;break;}
   const visited=n.children.reduce((s,c)=>s+(c.visits?c.prior:0),0),fpu=q(n)-.2*Math.sqrt(visited),sqrt=Math.sqrt(n.visits);let best=null,score=-Infinity;
   for(const c of n.children){const u=(c.visits?-q(c):fpu)+.6*c.prior*sqrt/(1+c.visits);if(u>score){score=u;best=c;}}
   n=best;if(!n.state)n.state=apply(n.parent.state,n.action);plies++;
   if(plies>=80){value=0;break;}
  }
  depth=Math.max(depth,plies);for(let p=n;p;p=p.parent){p.visits++;p.total+=value;value=-value;}simulations++;
  // Cached evaluations resolve in microtasks; yield so cancel messages can run.
  if(simulations%8===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(cancelled())throw aborted();
 const children=[...root.children].sort((a,b)=>b.visits-a.visits||b.prior-a.prior);
 // Immediate wins always outrank visit statistics, including a cold/short search.
 const win=children.find(c=>c.action.type==='move'&&c.action.y===(state.turn?8:0));
 let selected=win??children[0];
 // Web profiles are deterministic: they do not claim parity with Python guards.
 if(!win&&engine!=='sigma2'&&selected){
  const comparable=children.filter(c=>c.visits>=Math.max(2,selected.visits*.88)&&-q(c)>=-q(selected)-.04);
  if(engine==='sigma3')selected=comparable.find(c=>c.action.type==='move')??selected;
  if(engine==='sigma4')selected=comparable.reduce((a,c)=>(-q(c)+.015*Math.log1p(c.visits))>(-q(a)+.015*Math.log1p(a.visits))?c:a,selected);
 }
 if(!selected)throw Error('No legal browser action');
 const pv=[];let p=selected;while(p&&pv.length<8){pv.push(p.action);p=p.children?.filter(c=>c.visits).sort((a,b)=>b.visits-a.visits)[0];}
 const own=geometry(state).grids[state.turn][state.p[state.turn].y*9+state.p[state.turn].x];
 return {pv,done:true,nodes:simulations,simulations,evaluations,depth,score:Math.round((selected.visits?-q(selected):rootValue)*1000),elapsedMs:now()-started,
  engine,backend:'browser-wasm',engineVersion:'web-1',distance:own,diagnostics:{rootChildren:children.slice(0,12).map(c=>({action:c.action,visits:c.visits,prior:c.prior,qFromRoot:c.visits?-q(c):null}))}};
}
