import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {nativeSources,digest,nativeSourceHash} from './native-policy.mjs';
export const guardExecutable=fileURLToPath(new URL(`../guard-engine/target/release/quoridor-guard${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const guardSources=[...nativeSources,'speed-engine/src/ranking-paths.rs','guard-engine/Cargo.toml','guard-engine/Cargo.lock','guard-engine/build.rs','guard-engine/src/lib.rs','guard-engine/src/main.rs'];
export function guardIdentity(){return {baselineSourceHash:nativeSourceHash(),sources:Object.fromEntries(guardSources.map(f=>[f,digest(readFileSync(f))])),binaryHash:digest(readFileSync(guardExecutable))};}
export function verifyGuardBuild(){const r=guardIdentity(),saved=JSON.parse(readFileSync('guard-engine/target/release/source-manifest.json'));if(JSON.stringify(r)!==JSON.stringify(saved))throw Error('Rebuild guard engine');return r;}
