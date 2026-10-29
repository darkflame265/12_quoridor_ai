import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nativeSources,nativeSourceHash,digest} from './native-policy.mjs';
export const previewExecutable=fileURLToPath(new URL(`../reply-preview-engine/target/release/quoridor-reply-preview${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const previewSources=[...nativeSources,'search-probe-engine/src/probe.rs','reply-preview-engine/Cargo.toml','reply-preview-engine/Cargo.lock','reply-preview-engine/build.rs','reply-preview-engine/src/main.rs','route-filter-engine/src/filter.rs','reply-preview-engine/src/preview.rs'];
export function previewIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(previewSources.map(f=>[f,digest(readFileSync(f))])),binarySha256:digest(readFileSync(previewExecutable))};}
export function verifyPreviewBuild(){const identity=previewIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('reply-preview-engine/target/release/source-manifest.json'))))throw Error('Rebuild reply preview');return identity;}
