import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {probeIdentity} from '../evaluation/search-probe-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','search-probe-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status??1);
await writeFile('search-probe-engine/target/release/source-manifest.json',JSON.stringify(probeIdentity(),null,2)+'\n');
