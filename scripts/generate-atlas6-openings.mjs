import {initial,moves,validWall,apply,distance,legal} from '../src/engine.js';
import {readFileSync,writeFileSync} from 'node:fs';

const seed=Number(process.argv[2]??20261101)>>>0;
let rng=seed;
const random=()=>{rng=(rng+0x6D2B79F5)>>>0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const historical=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'));
const out=[...historical];
const seen=new Set(out.map(x=>JSON.stringify(x.state)));
let attempts=0;
while(out.length<100&&attempts++<5000){
 let state=initial(),valid=true;
 const length=6+Math.floor(random()*22);
 for(let ply=0;ply<length;ply++){
  if(state.winner!==null){valid=false;break;}
  const side=state.turn,opposite=1-side;
  const pawns=moves(state).map(a=>({a,next:apply(state,a)}));
  pawns.sort((a,b)=>distance(a.next,side)-distance(b.next,side));
  const min=Math.min(3,pawns.length);
  let picked=pawns[Math.floor(random()*min)]?.a;
  if(state.left[side]>0 && random()<0.33){
   const attempts=[];
   const target=state.p[opposite];
   for(let j=0;j<40;j++){
    const x=Math.max(0,Math.min(7,target.x-3+Math.floor(random()*7)));
    const y=Math.max(0,Math.min(7,target.y-3+Math.floor(random()*7)));
    for(const o of ['h','v']){
     const a={type:'wall',x,y,o};
     if(!validWall(state,a))continue;
     const n=apply(state,a);
     const swing=(distance(n,opposite)-distance(state,opposite))-(distance(n,side)-distance(state,side));
     if(swing>0)attempts.push({a,swing});
    }
   }
   attempts.sort((a,b)=>b.swing-a.swing);
   if(attempts.length)picked=attempts[Math.floor(random()*Math.min(4,attempts.length))].a;
  }
  if(!picked||!legal(state,picked)){valid=false;break;}
  state=apply(state,picked);
 }
 if(!valid||state.winner!==null)continue;
 const key=JSON.stringify(state);
 if(seen.has(key))continue;seen.add(key);
 out.push({id:'seed-'+seed+'-'+String(out.length).padStart(3,'0'),state});
}
if(out.length<100)throw Error('Could not generate 100 unique positions');
writeFileSync('evaluation/atlas6-tournament-openings.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({seed,openings:out.length,historical:historical.length,synthetic:out.length-historical.length}));
