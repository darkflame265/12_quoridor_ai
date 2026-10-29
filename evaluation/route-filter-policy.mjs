import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const filterExecutable=fileURLToPath(new URL(`../route-filter-engine/target/release/quoridor-route-filter${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const filterSources=[...nativeSources,'search-probe-engine/src/probe.rs','route-filter-engine/Cargo.toml','route-filter-engine/Cargo.lock','route-filter-engine/build.rs','route-filter-engine/src/main.rs','route-filter-engine/src/filter.rs'];
export function filterIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(filterSources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(filterExecutable))};}
export function verifyFilterBuild(){const identity=filterIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('route-filter-engine/target/release/source-manifest.json'))))throw Error('Rebuild boundary order');return identity;}
