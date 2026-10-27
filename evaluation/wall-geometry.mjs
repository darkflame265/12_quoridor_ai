export function segment(a){return a.o==='h'?[[a.x,a.y+1],[a.x+2,a.y+1]]:[[a.x+1,a.y],[a.x+1,a.y+2]];}
const pointEqual=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function on(p,[a,b]){return (b[0]-a[0])*(p[1]-a[1])===(b[1]-a[1])*(p[0]-a[0])&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}
export function wallContact(a,b){
 const first=segment(a),second=segment(b),ends=[...first,...second];
 const common=ends.filter(p=>on(p,first)&&on(p,second)).filter((p,i,all)=>all.findIndex(q=>pointEqual(p,q))===i);
 return common.length===1;
}
