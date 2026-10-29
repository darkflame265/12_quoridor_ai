import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const replyExecutable=fileURLToPath(new URL(`../reply-verify-engine/target/release/quoridor-reply-verify${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const replySources=[...nativeSources,'search-probe-engine/src/probe.rs','reply-verify-engine/Cargo.toml','reply-verify-engine/Cargo.lock','reply-verify-engine/build.rs','reply-verify-engine/src/main.rs','route-filter-engine/src/filter.rs','reply-verify-engine/src/verify.rs'];
export function replyIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(replySources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(replyExecutable))};}
export function verifyReplyBuild(){const identity=replyIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('reply-verify-engine/target/release/source-manifest.json'))))throw Error('Rebuild reply verifier');return identity;}
