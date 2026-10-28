import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const speedExecutable=fileURLToPath(new URL(`../speed-engine/target/release/quoridor-speed${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const speedSources=[...nativeSources,'speed-engine/Cargo.toml','speed-engine/Cargo.lock','speed-engine/build.rs','speed-engine/src/lib.rs','speed-engine/src/main.rs','speed-engine/src/ranking-paths.rs'];
export function speedIdentity(){return {baselineSourceHash:nativeSourceHash(),sources:Object.fromEntries(speedSources.map(f=>[f,digest(readFileSync(f))])),binaryHash:digest(readFileSync(speedExecutable))};}
export function verifySpeedBuild(){const actual=speedIdentity(),saved=JSON.parse(readFileSync('speed-engine/target/release/source-manifest.json'));if(JSON.stringify(actual)!==JSON.stringify(saved))throw Error('Rebuild speed-only engine');return actual;}
