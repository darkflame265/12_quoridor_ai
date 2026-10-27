export const canonicalAction=(a,turn)=>!turn?a:a<81?80-a:81+(a>=145?64:0)+63-(a-81)%64;
export function neuralFeatures(s){const t=s.turn,x=new Float32Array(292);[t,1-t].forEach((side,i)=>{const p=s.p[side],n=p.y*9+p.x;x[i*81+(t?80-n:n)]=1;});for(const w of s.walls){let n=w.y*8+w.x;if(t)n=63-n;x[162+(w.o==='v'?64:0)+n]=1;}x[290]=s.left[t]/10;x[291]=s.left[1-t]/10;return x;}
export class PolicyValueModel{
 constructor(data){if(data.format!=='atlas-policy-value-v1'||data.features!==292||data.actions!==209||!Number.isInteger(data.hidden)||data.hidden<1||data.hidden>2048)throw Error('Incompatible policy/value model');this.data=data;this.hidden=data.hidden;const w=data.weights;
  for(const [key,rows,cols]of [['trunk.0.weight',this.hidden,292],['trunk.2.weight',this.hidden,this.hidden],['policy.weight',209,this.hidden],['value.weight',1,this.hidden]]){if(w[key]?.length!==rows||w[key].some(row=>row.length!==cols||row.some(n=>!Number.isFinite(n))))throw Error('Invalid model weights');}
  for(const [key,n]of [['trunk.0.bias',this.hidden],['trunk.2.bias',this.hidden],['policy.bias',209],['value.bias',1]])if(w[key]?.length!==n||w[key].some(n=>!Number.isFinite(n)))throw Error('Invalid model bias');
 }
 linear(x,name,relu=false){const w=this.data.weights,weights=w[name+'.weight'],bias=w[name+'.bias'];return Float64Array.from(weights,(row,i)=>{let sum=bias[i];for(let j=0;j<x.length;j++)sum+=row[j]*x[j];return relu?Math.max(0,sum):sum;});}
 predict(state,legalActions){const h=this.linear(this.linear(neuralFeatures(state),'trunk.0',true),'trunk.2',true),logits=this.linear(h,'policy'),value=Math.tanh(this.linear(h,'value')[0]);const selected=legalActions.map(a=>logits[canonicalAction(a,state.turn)]),max=Math.max(...selected),exp=selected.map(n=>Math.exp(n-max)),total=exp.reduce((a,b)=>a+b,0);return {policy:exp.map(n=>n/total),value,logits};}
}
