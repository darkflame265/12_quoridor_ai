import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {pressureIdentity} from '../evaluation/pressure-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','pressure-engine/Cargo.toml','--target-dir','pressure-engine/target/weak-wall'],{stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status??1);
await writeFile('pressure-engine/target/release/source-manifest.json',JSON.stringify(pressureIdentity(),null,2)+'\n');
