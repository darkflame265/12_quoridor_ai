import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest,nativeSources,nativeSourceHash} from './native-policy.mjs';
export const pressureExecutable=fileURLToPath(new URL(`../pressure-engine/target/reserve/release/quoridor-pressure${process.platform==='win32'?'.exe':''}`,import.meta.url));
export const pressureSources=[...nativeSources,'pressure-engine/Cargo.toml','pressure-engine/Cargo.lock','pressure-engine/build.rs','pressure-engine/src/lib.rs','pressure-engine/src/main.rs','pressure-engine/src/pressure.rs','pressure-engine/src/reserve.rs'];
export function pressureIdentity(){return {nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(pressureSources.map(f=>[f,digest(readFileSync(f))])),binaryHash:digest(readFileSync(pressureExecutable))};}
export function verifyPressureBuild(){const identity=pressureIdentity();if(JSON.stringify(identity)!==JSON.stringify(JSON.parse(readFileSync('pressure-engine/target/release/source-manifest.json'))))throw Error('즉시 압박 엔진을 다시 빌드하세요.');return identity;}
