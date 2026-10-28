import {spawnSync} from 'node:child_process';import {writeFile} from 'node:fs/promises';import {homedir} from 'node:os';import path from 'node:path';
import {guardIdentity} from '../evaluation/guard-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','guard-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);
await writeFile('guard-engine/target/release/source-manifest.json',JSON.stringify(guardIdentity(),null,2)+'\n');
