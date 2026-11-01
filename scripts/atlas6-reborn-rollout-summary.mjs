import {readFileSync} from 'node:fs';
const f=process.argv[2];
const r=JSON.parse(readFileSync(f,'utf8'));
const z=1.96;
const stats=Object.fromEntries(Object.entries(r.tally).map(([k,v])=>{
 const n=v.win+v.loss, p=n?v.win/n:0;
 const denom=1+z*z/Math.max(1,n),center=(p+z*z/(2*Math.max(1,n)))/denom;
 const margin=z*Math.sqrt((p*(1-p)+z*z/(4*Math.max(1,n)))/Math.max(1,n))/denom;
 return [k,{...v,decisiveGames:n,decisiveWinRate:n?p:null,wilson95:n?[Math.max(0,center-margin),Math.min(1,center+margin)]:null}];
}));
console.log(JSON.stringify({source:f,trials:r.repetitions,stats,conclusion:'The intervals are broad and unresolved outcomes remain; no winning-move proof.'},null,2));
