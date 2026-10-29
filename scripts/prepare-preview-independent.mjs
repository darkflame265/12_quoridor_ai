import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {study,archiveGeometries,independentCases} from '../evaluation/preview-independent.mjs';
import {digest,activeNativeProfile} from '../evaluation/native-policy.mjs';
import {verifyPreviewBuild} from '../evaluation/reply-preview-policy.mjs';
import {verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {nativeExecutable} from '../server/native-process.mjs';
const out=process.argv[2];if(!out)throw Error('Specify fresh study directory');assert.equal(activeNativeProfile(),'candidate');
async function files(dir){const list=[];for(const e of await readdir(dir,{withFileTypes:true})){const f=path.posix.join(dir,e.name);if(e.isDirectory())list.push(...await files(f));else if(e.name.endsWith('.json'))list.push(f);}return list;}
const inventory=[],excluded=new Set();
for(const file of [...await files('reports'),...await files('evaluation/fixtures')].sort()){
 const text=(await readFile(file,'utf8')).replaceAll('\r\n','\n');let data;try{data=JSON.parse(text);}catch{throw Error(`Invalid archived JSON ${file}`);}
 inventory.push({file,sha256:digest(text)});archiveGeometries(data,excluded);
}
console.log(`Archived files ${inventory.length}; unique wall geometries ${excluded.size}`);
const cases=independentCases(excluded);await mkdir(out,{recursive:false});await mkdir(path.join(out,'replays'));
for(const c of cases)await writeFile(path.join(out,'replays',`${c.id}.json`),JSON.stringify({version:2,records:c.records,mode:'sandbox',side:c.state.turn,startPosition:'top',time:'500',cores:'4',engine:'atlas5',study:study.version},null,2)+'\n',{flag:'wx'});
const corpus={study:study.version,cases,exclusion:{algorithm:'canonical wall geometry under horizontal/vertical reflections and 180 rotation; ignores stocks and pawn locations',archiveFiles:inventory.length,geometries:excluded.size,sha256:digest([...excluded].sort().join('\n')),coverage:'Explicit saved states and wall prefixes of records; not every hypothetical position ever searched.'}};
const corpusBytes=JSON.stringify(corpus,null,2)+'\n',inventoryBytes=JSON.stringify({encoding:'utf8-lf',files:inventory},null,2)+'\n';
await writeFile(path.join(out,'corpus.json'),corpusBytes,{flag:'wx'});await writeFile(path.join(out,'archive-inventory.json'),inventoryBytes,{flag:'wx'});
const tools=['evaluation/preview-independent.mjs','evaluation/preview-study-io.mjs','evaluation/native-policy.mjs','evaluation/reply-preview-policy.mjs','evaluation/root-guard-policy.mjs','scripts/prepare-preview-independent.mjs','scripts/run-preview-independent.mjs','scripts/verify-preview-independent.mjs','src/engine.js','src/search.js','src/spectator.js','evaluation/suite.js','evaluation/wall-geometry.mjs','evaluation/strategy-book.mjs','server/native-process.mjs'];
const registration={format:'atlas-pressure-registration-v1',createdAt:new Date().toISOString(),runtime:{node:process.version,platform:process.platform,arch:process.arch},study,corpusSha256:digest(corpusBytes),inventorySha256:digest(inventoryBytes),identity:verifyPreviewBuild(),referenceIdentity:verifyRootGuardBuild(),nativeBinarySha256:digest(await readFile(nativeExecutable)),sourceEncoding:'utf8-lf',sourceHashes:Object.fromEntries(await Promise.all(tools.map(async f=>[f,digest((await readFile(f,'utf8')).replaceAll('\r\n','\n'))])))};
await writeFile(path.join(out,'registration.json'),JSON.stringify(registration,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({registrationSha256:digest(JSON.stringify(registration,null,2)+'\n'),cases:cases.map(c=>({id:c.id,walls:c.state.walls.length,distances:c.distances,cluster:c.cluster})),criteria:study.criteria},null,2));
