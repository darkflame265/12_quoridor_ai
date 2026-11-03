import {readFileSync,writeFileSync} from 'node:fs';
const all=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const ids=[15,20,22,26,31,33];
const selected=ids.map(i=>({...all[i],sourceIndex:i}));
writeFileSync('evaluation/sigma3-midgame-match-fixtures-6.json',JSON.stringify(selected,null,2));
console.log('FIXTURES',ids);
