import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';import path from 'node:path';import {nativeSources,digest} from '../evaluation/native-policy.mjs';
const r=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','diagnostic-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status??1);
const files=[...nativeSources,'speed-engine/src/ranking-paths.rs','diagnostic-engine/Cargo.toml','diagnostic-engine/Cargo.lock','diagnostic-engine/build.rs','diagnostic-engine/src/lib.rs','diagnostic-engine/src/main.rs','diagnostic-engine/src/bin/audit.rs'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(f))]))),suffix=process.platform==='win32'?'.exe':'';
await writeFile('diagnostic-engine/target/release/source-manifest.json',JSON.stringify({sources,diagnosticBinary:digest(await readFile('diagnostic-engine/target/release/quoridor-diagnostic'+suffix)),auditBinary:digest(await readFile('diagnostic-engine/target/release/audit'+suffix))},null,2)+'\n');
