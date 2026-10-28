import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const boundaryExecutable=fileURLToPath(new URL(`../boundary-order-engine/target/release/quoridor-boundary-order${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const boundarySources=[...nativeSources,'search-probe-engine/src/probe.rs','boundary-order-engine/Cargo.toml','boundary-order-engine/Cargo.lock','boundary-order-engine/build.rs','boundary-order-engine/src/main.rs','boundary-order-engine/src/boundary.rs'];
export function boundaryIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(boundarySources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(boundaryExecutable))};}
export function verifyBoundaryBuild(){const identity=boundaryIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('boundary-order-engine/target/release/source-manifest.json'))))throw Error('Rebuild boundary order');return identity;}
