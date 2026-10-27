import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {EXTERNAL_COMMIT,EXTERNAL_URL} from '../evaluation/external-adapter.js';
await mkdir('.external',{recursive:true});const dir='.external/quoridor-ai';
if(!existsSync(dir)){for(const args of [['init',dir],['-C',dir,'remote','add','origin',EXTERNAL_URL+'.git'],['-C',dir,'fetch','--depth','1','origin',EXTERNAL_COMMIT],['-C',dir,'checkout','--detach','FETCH_HEAD']]){const r=spawnSync('git',args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}}
const actual=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==EXTERNAL_COMMIT)throw Error('Existing external checkout differs; it was not overwritten.');console.log(`Pinned MIT external engine ready: ${actual}`);
