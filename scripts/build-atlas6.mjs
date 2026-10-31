import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const cargo=path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo');
const result=spawnSync(cargo,['build','--release','--locked','--manifest-path','atlas6-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status??1);
await writeFile('atlas6-engine/target/release/build-info.json',JSON.stringify({builtAt:new Date().toISOString()},null,2));
