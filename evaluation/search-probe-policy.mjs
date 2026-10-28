import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,digest,nativeSourceHash} from './native-policy.mjs';
export const probeExecutable=fileURLToPath(new URL(`../search-probe-engine/target/release/quoridor-search-probe${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const probeSources=[...nativeSources,'search-probe-engine/Cargo.toml','search-probe-engine/Cargo.lock','search-probe-engine/build.rs','search-probe-engine/src/main.rs','search-probe-engine/src/probe.rs'];
export function probeIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(probeSources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(probeExecutable))};}
export function verifyProbeBuild(){const identity=probeIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('search-probe-engine/target/release/source-manifest.json'))))throw Error('Rebuild search probe');return identity;}
