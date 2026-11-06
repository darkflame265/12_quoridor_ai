import {readFileSync,writeFileSync} from 'node:fs';
const all=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const ids=[15,17,19,20,21,22,23,24,26,28,31,33];
const f=ids.map(i=>({...all[i],sourceIndex:i}));
writeFileSync('evaluation/sigma3-midgame-match-fixtures.json',JSON.stringify(f,null,2));
console.log('FIXTURES',ids.map(i=>({i,phase:all[i].phase,ply:all[i].ply,walls:all[i].s.walls.length})));
