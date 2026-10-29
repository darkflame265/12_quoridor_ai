import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {filterIdentity} from '../evaluation/route-filter-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','route-filter-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status??1);
await writeFile('route-filter-engine/target/release/source-manifest.json',JSON.stringify(filterIdentity(),null,2)+'\n');
