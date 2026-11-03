import {readFileSync,writeFileSync} from 'node:fs';
const all=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const audits=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8')).positions;
const ids=[25,27,29,34];
const result=ids.map(id=>{
 const f=all[id],a=audits.find(x=>x.id===id);
 if(!f||!a)throw Error('missing fixture '+id);
 return {id,source:'sigma3-diverse-match-fixtures.json',phase:f.phase,ply:f.ply,
  s:f.s,history:f.history.slice(-48),
  rootCandidates:a.off.visits.slice(0,2)};
});
writeFileSync('evaluation/sigma3-independent-middle-fixtures.json',JSON.stringify(result,null,2));
console.log('snapshots',result.map(x=>({id:x.id,history:x.history.length,visits:x.rootCandidates.map(y=>y.visits)})));
