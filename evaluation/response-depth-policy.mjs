import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const depthExecutable=fileURLToPath(new URL(`../response-depth-engine/target/release/quoridor-response-depth${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const depthSources=[...nativeSources,'search-probe-engine/src/probe.rs','response-order-engine/src/ordering.rs','response-depth-engine/Cargo.toml','response-depth-engine/Cargo.lock','response-depth-engine/build.rs','response-depth-engine/src/main.rs','response-depth-engine/src/scoped.rs'];
export function depthIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(depthSources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(depthExecutable))};}
export function verifyDepthBuild(){const identity=depthIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('response-depth-engine/target/release/source-manifest.json'))))throw Error('Rebuild response depth');return identity;}
