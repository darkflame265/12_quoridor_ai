import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const responseExecutable=fileURLToPath(new URL(`../response-order-engine/target/release/quoridor-response-order${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const responseSources=[...nativeSources,'search-probe-engine/src/probe.rs','response-order-engine/Cargo.toml','response-order-engine/Cargo.lock','response-order-engine/build.rs','response-order-engine/src/main.rs','response-order-engine/src/ordering.rs'];
export function responseIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(responseSources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(responseExecutable))};}
export function verifyResponseBuild(){const identity=responseIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('response-order-engine/target/release/source-manifest.json'))))throw Error('Rebuild response order');return identity;}
