import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {nativeSources,digest,nativeSourceHash} from './native-policy.mjs';
export const mazeGuardExecutable=fileURLToPath(new URL(`../maze-guard-engine/target/release/quoridor-maze-guard${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const mazeGuardSources=[...nativeSources,'speed-engine/src/ranking-paths.rs','maze-guard-engine/Cargo.toml','maze-guard-engine/Cargo.lock','maze-guard-engine/build.rs','maze-guard-engine/src/lib.rs','maze-guard-engine/src/main.rs'];
export function mazeGuardIdentity(){return {baselineSourceHash:nativeSourceHash(),sources:Object.fromEntries(mazeGuardSources.map(f=>[f,digest(readFileSync(f))])),binaryHash:digest(readFileSync(mazeGuardExecutable))};}
export function verifyMazeGuardBuild(){const r=mazeGuardIdentity(),saved=JSON.parse(readFileSync('maze-guard-engine/target/release/source-manifest.json'));if(JSON.stringify(r)!==JSON.stringify(saved))throw Error('Rebuild guard engine');return r;}
