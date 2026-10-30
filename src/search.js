// Compact search state. Public game rules remain independently implemented in engine.js.
export const ENGINE_VERSION = 'Atlas 3.1';
const WIN = 30000, INF = 32000;
const BASE = Array.from({length:81},(_,i)=>[i>=9?i-9:-1,i%9<8?i+1:-1,i<72?i+9:-1,i%9?i-1:-1]);
const opposite=[2,3,0,1];
const random = (()=>{let n=0x9e3779b9;return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return n>>>0;};})();
const ZP=Array.from({length:2},()=>Array.from({length:81},random));
const ZW=Array.from({length:128},random), ZL=Array.from({length:2},()=>Array.from({length:11},random)), ZT=random();
export const encode = a => a.type==='move'?a.y*9+a.x:81+(a.o==='v'?64:0)+a.y*8+a.x;
export const decode = a => a<81?{type:'move',x:a%9,y:Math.floor(a/9)}:{type:'wall',o:a>=145?'v':'h',x:(a-81)%8,y:Math.floor(((a-81)%64)/8)};

// Exact retrograde solution of the fixed maze after BOTH players exhaust their walls.
// Unresolved cycles are draws; no arbitrary move limit is used to declare a winner.
export function solveEndgame(state,check=()=>{}){
 const p=new Position(state),size=81*81*2,key=(a,b,t)=>(a*81+b)*2+t;
 const outcome=new Int8Array(size),distance=new Uint16Array(size),degree=new Uint8Array(size),best=new Int16Array(size);best.fill(-1);
 const predecessors=Array.from({length:size},()=>[]),queue=[];
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(let t=0;t<2;t++){
   if((b&7)===0)check();const k=key(a,b,t);p.p=[a,b];p.turn=t;
   const winner=a<9?0:b>=72?1:-1;
   if(winner>=0){outcome[k]=winner===t?1:-1;queue.push(k);continue;}
   for(const move of p.pawnMoves()){const child=t===0?key(move,b,1):key(a,move,0);predecessors[child].push([k,move]);degree[k]++;}
 }
 const maxLoss=new Uint16Array(size);
 for(let head=0;head<queue.length;head++){if((head&255)===0)check();const child=queue[head];for(const [parent,move] of predecessors[child]){if(outcome[parent])continue;
   if(outcome[child]===-1){outcome[parent]=1;distance[parent]=distance[child]+1;best[parent]=move;queue.push(parent);}
   else {degree[parent]--;if(distance[child]+1>=maxLoss[parent]){maxLoss[parent]=distance[child]+1;best[parent]=move;}if(!degree[parent]){outcome[parent]=-1;distance[parent]=maxLoss[parent];queue.push(parent);}}
 }}
 const goalMaps=[0,1].map(t=>{p.routeInfo(t);return Int16Array.from(p.dist);});
 return {states:81*80*2,lookup(a,b,t){
  const k=key(a,b,t);let move=best[k];p.p=[a,b];p.turn=t;
  const equivalent=p.pawnMoves().filter(m=>{const child=t===0?key(m,b,1):key(a,m,0);return outcome[child]===-outcome[k]&&(!outcome[k]||distance[child]+1===distance[k]);});
  if(equivalent.length){const map=goalMaps[t];equivalent.sort((a,b)=>map[a]-map[b]||a-b);move=equivalent[0];}
  return {outcome:outcome[k],distance:distance[k],move};
 }};
}

export class Position {
  constructor(s){
    this.edges=Int16Array.from(BASE.flat());this.walls=new Uint8Array(128);
    this.p=s.p.map(p=>p.y*9+p.x);this.left=[...s.left];this.turn=s.turn;
    for(const w of s.walls){const a=encode({...w,type:'wall'});this.walls[a-81]=1;this.toggle(a,true);}
    this.hash=this.calculateHash();this.queue=new Int16Array(81);this.dist=new Int16Array(81);
  }
  calculateHash(){let h=ZP[0][this.p[0]]^ZP[1][this.p[1]]^ZL[0][this.left[0]]^ZL[1][this.left[1]];if(this.turn)h^=ZT;for(let i=0;i<128;i++)if(this.walls[i])h^=ZW[i];return h>>>0;}
  // Used to verify a hash hit, so a 32-bit hash collision cannot supply another position's score.
  signature(){return `${this.p}/${this.left}/${this.turn}/${this.walls.join('')}`;}
  toggle(a,blocked){const i=a-81,v=i>=64,k=i%64,x=k%8,y=k>>3,n=y*9+x,d=v?1:2,m=v?n+9:n+1;for(const p of [n,m]){const q=BASE[p][d];this.edges[p*4+d]=blocked?-1:q;this.edges[q*4+opposite[d]]=blocked?-1:p;}}
  terminal(){const t=this.turn;return (this.p[1-t]<9&&1-t===0)||(this.p[1-t]>=72&&1-t===1);}
  pawnMoves(t=this.turn,from=this.p[t]){const out=[],other=this.p[1-t];for(let d=0;d<4;d++){const n=this.edges[from*4+d];if(n<0)continue;if(n!==other){out.push(n);continue;}const jump=this.edges[n*4+d];if(jump>=0)out.push(jump);else for(const side of [(d+1)%4,(d+3)%4]){const q=this.edges[n*4+side];if(q>=0)out.push(q);}}return out;}
  distances(t,withPawn=false){const dist=this.dist,queue=this.queue;dist.fill(-1);const start=this.p[t];queue[0]=start;dist[start]=0;let head=0,tail=1;while(head<tail){const n=queue[head++];if(t===0?n<9:n>=72)return dist[n];const next=withPawn?this.pawnMoves(t,n):null;for(let d=0;d<(next?next.length:4);d++){const q=next?next[d]:this.edges[n*4+d];if(q>=0&&dist[q]<0){dist[q]=dist[n]+1;queue[tail++]=q;}}}return 100;}
  wallFits(a){const i=a-81,v=i>=64,k=i%64,x=k%8,y=k>>3;if(this.walls[i]||this.walls[(i+64)%128])return false;return v?!(y>0&&this.walls[i-8]||y<7&&this.walls[i+8]):!(x>0&&this.walls[i-1]||x<7&&this.walls[i+1]);}
  wallLegal(a){if(!this.left[this.turn]||!this.wallFits(a))return false;this.toggle(a,true);const ok=this.distances(0)<100&&this.distances(1)<100;this.toggle(a,false);return ok;}
  actions(){if(this.terminal())return [];const a=this.pawnMoves();if(this.left[this.turn])for(let i=81;i<209;i++)if(this.wallLegal(i))a.push(i);return a;}
  make(a){const t=this.turn,old=this.p[t],hash=this.hash;this.hash^=ZT;if(a<81){this.hash^=ZP[t][old]^ZP[t][a];this.p[t]=a;}else{this.walls[a-81]=1;this.toggle(a,true);this.hash^=ZW[a-81]^ZL[t][this.left[t]]^ZL[t][this.left[t]-1];this.left[t]--;}this.turn=1-t;this.hash>>>=0;return {a,old,hash};}
  unmake(u){this.turn=1-this.turn;if(u.a<81)this.p[this.turn]=u.old;else{this.walls[u.a-81]=0;this.toggle(u.a,false);this.left[this.turn]++;}this.hash=u.hash;}
  // Goal distance maps also measure how many immediate routes preserve shortest progress.
  routeInfo(t){const d=this.dist;d.fill(-1);const q=this.queue;let head=0,tail=0;for(let x=0;x<9;x++){const n=(t===0?0:72)+x;d[n]=0;q[tail++]=n;}while(head<tail){const n=q[head++];for(let j=0;j<4;j++){const b=this.edges[n*4+j];if(b>=0&&d[b]<0){d[b]=d[n]+1;q[tail++]=b;}}}const p=this.p[t];let routes=0;for(let j=0;j<4;j++){const b=this.edges[p*4+j];if(b>=0&&d[b]===d[p]-1)routes++;}return {distance:d[p],routes};}
  evaluate(){const t=this.turn,o=1-t,a=this.routeInfo(t),b=this.routeInfo(o),near=Math.abs(this.p[0]%9-this.p[1]%9)+Math.abs((this.p[0]/9|0)-(this.p[1]/9|0))<=3,da=near?this.distances(t,true):a.distance,db=near?this.distances(o,true):b.distance;
    // Distances include the occupied square/jump. Alternative exits matter only while walls remain.
    const resources=this.left[t]+this.left[o];
    return (db-da)*120+(b.distance-a.distance)*12+(this.left[t]-this.left[o])*(resources>8?32:40)+(a.routes-b.routes)*(resources?8:0);
  }
  wallConnections(a){const i=a-81,v=i>=64,k=i%64,x=k%8,y=k>>3;let connections=0;
    // End-to-end chains and perpendicular ends can create a long detour on a later turn.
    for(const delta of (v?[-16,16]:[-2,2])){const j=i+delta;if(j>=0&&j<128&&(j>=64)===v&&(v?j%8===x:(j%64>>3)===y)&&this.walls[j])connections++;}
    for(const w of (v?[[x-1,y],[x,y],[x-1,y+2],[x,y+2]]:[[x,y-1],[x,y],[x+2,y-1],[x+2,y]]))if(w[0]>=0&&w[0]<8&&w[1]>=0&&w[1]<8&&this.walls[(v?0:64)+w[1]*8+w[0]])connections++;
    return connections;
  }
  wallPotential(target,limit=4){
    const attacker=1-target;if(!this.left[attacker])return {gain:0,delay:0,wall:null};
    const base=this.routeInfo(target).distance,goalMap=Int16Array.from(this.dist),other=this.distances(attacker),candidates=new Map();
    // Sample all shortest-path branches. Rank a bounded number of legal threats;
    // this is a heuristic, never a proof that other wall placements are harmless.
    const pending=[this.p[target]],seen=new Uint8Array(81);seen[pending[0]]=1;
    for(let h=0;h<pending.length;h++){const n=pending[h];for(let d=0;d<4;d++){const q=this.edges[n*4+d];if(q<0||goalMap[q]!==goalMap[n]-1)continue;
      if(!seen[q]){seen[q]=1;pending.push(q);}const x=Math.min(n%9,q%9),y=Math.min(n/9|0,q/9|0),v=(n/9|0)===(q/9|0);
      const anchors=v?[[x,y-1],[x,y]]:[[x-1,y],[x,y]];
      for(const [wx,wy] of anchors){if(wx<0||wy<0||wx>7||wy>7)continue;const a=81+(v?64:0)+wy*8+wx;if(!this.wallFits(a))continue;
        const rank=this.wallConnections(a)*30+(base-goalMap[n])*0.2+1;candidates.set(a,(candidates.get(a)||0)+rank);
      }
    }}
    const threats=[...candidates].sort((a,b)=>b[1]-a[1]).slice(0,limit);let best={gain:0,delay:0,wall:null};
    for(const [a] of threats){this.toggle(a,true);const distance=this.distances(target),attackerDistance=this.distances(attacker);this.toggle(a,false);
      if(distance>=100||attackerDistance>=100)continue;
      const delay=distance-base,gain=delay-(attackerDistance-other)-1;
      if(gain>best.gain)best={gain,delay,wall:decode(a)};
    }return best;
  }
}

export class SearchEngine {
 constructor({maxEntries=150000,strategy=true}={}){this.table=new Map();this.endgames=new Map();this.evaluations=new Map();this.strategy=strategy;this.maxEntries=maxEntries;this.history=new Int32Array(418);this.killers=[];}
 clear(){this.table.clear();this.endgames.clear();this.evaluations.clear();this.history.fill(0);this.killers=[];}
 evaluate(p){if(!this.strategy)return p.evaluate();const sig=p.signature(),cached=this.evaluations.get(p.hash);if(cached?.signature===sig)return cached.score;
   const attack=p.wallPotential(1-p.turn),defense=p.wallPotential(p.turn);
   // A final defensive wall is worth more than the tenth spare wall. The old
   // linear inventory term encouraged spending every wall on short-lived delays.
   const t=p.turn,o=1-t,total=p.left[t]+p.left[o],stock=n=>100*Math.sqrt(n)+20*n;
   const reserve=stock(p.left[t])-stock(p.left[o])-(p.left[t]-p.left[o])*(total>8?32:40);
   const score=p.evaluate()+Math.round(reserve+(attack.gain-defense.gain)*64);
   if(this.evaluations.size>=25000)this.evaluations.clear();this.evaluations.set(p.hash,{signature:sig,score});return score;
 }
 check(){if(performance.now()>=this.deadline||this.nodes>=this.nodeLimit)throw this.timeout;}
 ordered(p,ttMove,ply){const list=p.pawnMoves();if(p.left[p.turn])for(let a=81;a<209;a++)if(p.wallFits(a))list.push(a);
   const me=p.turn,own=p.distances(me),enemy=p.distances(1-me);const ranked=[];
   for(const a of list){this.check();let score=this.history[me*209+a];if(a===ttMove)score+=10000000;else if(this.killers[ply]?.includes(a))score+=500000;
     const u=p.make(a);if(p.terminal())score+=20000000;
     else {const mine=p.distances(me),theirs=p.distances(1-me);if(mine>=100||theirs>=100){p.unmake(u);continue;}score+=a<81?(own-mine)*1500+250:((theirs-enemy)-(mine-own))*1600-130;}
     p.unmake(u);if(a>=81&&this.strategy)score+=p.wallConnections(a)*180;ranked.push({a,score});
   }ranked.sort((a,b)=>b.score-a.score);return ranked.map(r=>r.a);
 }
 negamax(p,depth,alpha,beta,ply,path){this.nodes++;this.check();if(p.terminal())return -WIN+ply;
   // Search loops are neutral. These path-dependent bounds are deliberately never cached.
   const key=p.hash,signature=p.signature();if(path.has(signature))return 0;
   const winningMove=p.pawnMoves().find(a=>p.turn===0?a<9:a>=72);
   if(winningMove!==undefined){const sig=p.signature();this.table.set(p.hash,{signature:sig,context:[...path].join('|'),depth:99,score:WIN-1,best:winningMove,flag:'exact'});return WIN-ply-1;}
   // A threatened goal is not a quiet leaf: read the forced defense before evaluating.
   if(depth<=0){const enemy=p.pawnMoves(1-p.turn).some(a=>p.turn===0?a>=72:a<9);if(enemy&&ply<12)depth=1;else return this.evaluate(p);}
   const entry=this.table.get(key),hit=entry?.signature===signature?entry:null;
   // Only reuse move ordering across paths; score bounds are confined to the same search path.
   const context=[...path].join('|');
   if(hit&&hit.context===context&&hit.depth>=depth){const score=hit.score>WIN-500?hit.score-ply:hit.score<-WIN+500?hit.score+ply:hit.score;if(hit.flag==='exact')return score;if(hit.flag==='lower')alpha=Math.max(alpha,score);if(hit.flag==='upper')beta=Math.min(beta,score);if(alpha>=beta)return score;}
   const originalAlpha=alpha,originalBeta=beta,list=this.ordered(p,hit?.best,ply);let best=-INF,bestMove=list[0];path.add(signature);
   try{for(let i=0;i<list.length;i++){const a=list[i],u=p.make(a);let score;try{
       // Late moves get a shallow probe, but every improvement is searched at full depth.
       // In a dense maze almost every wall is connected. Exempting all of them
       // at every depth destroyed selective deepening precisely in those games.
       const setup=ply<2&&a>=81&&this.strategy&&p.wallConnections(a)>0;
       const reduce=depth>=3&&i>=8&&a!==hit?.best&&!p.terminal()&&!setup?1:0;
       if(i===0)score=-this.negamax(p,depth-1,-beta,-alpha,ply+1,path);
       else {score=-this.negamax(p,depth-1-reduce,-alpha-1,-alpha,ply+1,path);if(reduce&&score>alpha)score=-this.negamax(p,depth-1,-alpha-1,-alpha,ply+1,path);if(score>alpha&&score<beta)score=-this.negamax(p,depth-1,-beta,-alpha,ply+1,path);}
     }finally{p.unmake(u);}if(score>best){best=score;bestMove=a;}alpha=Math.max(alpha,score);if(alpha>=beta){this.history[p.turn*209+a]=Math.min(100000,this.history[p.turn*209+a]+depth*depth);this.killers[ply]=[a,...(this.killers[ply]||[]).filter(b=>b!==a)].slice(0,2);break;}}
   }finally{path.delete(signature);}
   if(this.table.size>=this.maxEntries)this.table.clear();
   const stored=best>WIN-500?best+ply:best<-WIN+500?best-ply:best;
   this.table.set(key,{signature,context,depth,score:stored,best:bestMove,flag:best<=originalAlpha?'upper':best>=originalBeta?'lower':'exact'});return best;
 }
 pv(p,maxDepth){const out=[],undos=[],seen=new Set();for(let i=0;i<maxDepth&&!p.terminal();i++){const sig=p.signature();if(seen.has(sig))break;seen.add(sig);const e=this.table.get(p.hash);if(!e||e.signature!==sig)break;const a=e.best;if(a===undefined||!(a<81?p.pawnMoves().includes(a):p.wallLegal(a)))break;out.push(decode(a));undos.push(p.make(a));}while(undos.length)p.unmake(undos.pop());return out;}
 search(state,{ms=2000,maxDepth=40,nodeLimit=Infinity,onProgress=()=>{}}={}){
   const p=new Position(state),start=performance.now();this.deadline=start+Math.max(1,ms);this.nodes=0;this.nodeLimit=nodeLimit;this.timeout=new Error('search budget');this.killers=[];this.history.fill(0);
   if(state.winner!==null)return {pv:[],depth:0,nodes:0,elapsedMs:0,engine:ENGINE_VERSION};
   // A legal fallback is always available, even with an extremely small time budget.
   const fallback=p.pawnMoves().sort((a,b)=>state.turn===0?a-b:b-a)[0];
   let result={pv:fallback===undefined?[]:[decode(fallback)],score:0,depth:0};
   if(!state.left[0]&&!state.left[1]){
     try{const key=p.walls.join('');let table=this.endgames.get(key);if(!table){table=solveEndgame(state,()=>this.check());if(this.endgames.size>=4)this.endgames.clear();this.endgames.set(key,table);}const exact=table.lookup(p.p[0],p.p[1],p.turn);if(exact.move>=0)return {pv:[decode(exact.move)],score:exact.outcome*(WIN-exact.distance),exact:true,outcome:exact.outcome,distance:exact.distance,depth:0,nodes:table.states,elapsedMs:performance.now()-start,engine:ENGINE_VERSION};}catch(e){if(e!==this.timeout)throw e;}
   }
   for(let depth=1;depth<=maxDepth;depth++){try{this.check();const score=this.negamax(p,depth,-INF,INF,0,new Set()),pv=this.pv(p,depth);if(pv.length)result={score,pv,depth};onProgress({...result,nodes:this.nodes,elapsedMs:performance.now()-start,engine:ENGINE_VERSION});if(Math.abs(score)>WIN-500)break;}catch(e){if(e!==this.timeout)throw e;break;}}
   return {...result,nodes:this.nodes,elapsedMs:performance.now()-start,engine:ENGINE_VERSION,cacheEntries:this.table.size};
 }
}
