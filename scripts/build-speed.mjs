import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {speedIdentity} from '../evaluation/speed-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','speed-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status??1);
await writeFile('speed-engine/target/release/source-manifest.json',JSON.stringify(speedIdentity(),null,2)+'\n');
