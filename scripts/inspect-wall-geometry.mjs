import {readFile,writeFile} from 'node:fs/promises';
import {initial,legal} from '../src/engine.js';
import {Position,encode} from '../src/search.js';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2];if(!out)throw Error('Specify a fresh diagnostic JSON file');
const state=initial();state.walls=[{type:'wall',o:'v',x:5,y:3,owner:1}];state.left[1]=9;
const action={type:'wall',o:'h',x:3,y:4},mirrored=structuredClone(state);
mirrored.p=mirrored.p.map(p=>({x:8-p.x,y:p.y}));mirrored.walls=mirrored.walls.map(w=>({...w,x:7-w.x}));
const mirrorAction={...action,x:7-action.x};
// Dual-grid wall segments in tile-width units. Both examples have a one-unit
// gap between the horizontal endpoint and the vertical endpoint.
const example={state,action,legal:legal(state,action),legacyConnections:new Position(state).wallConnections(encode(action)),segments:[[[3,5],[5,5]],[[6,3],[6,5]]]};
const reflected={state:mirrored,action:mirrorAction,legal:legal(mirrored,mirrorAction),legacyConnections:new Position(mirrored).wallConnections(encode(mirrorAction)),segments:[[[4,5],[6,5]],[[3,3],[3,5]]]};
if(!example.legal||!reflected.legal)throw Error('Invalid diagnostic geometry');
const sources=Object.fromEntries(await Promise.all(['src/search.js','rust-engine/src/lib.rs','scripts/inspect-wall-geometry.mjs'].map(async f=>[f,digest(await readFile(f))])));
const result={format:'atlas-wall-geometry-diagnostic-v1',sources,example,reflected,expectedReflectionInvariant:true,observedMismatch:example.legacyConnections!==reflected.legacyConnections,physicalEndpointGap:1,developmentOnly:true,note:'The legacy JS connection heuristic is not reflection invariant on this legal pair. Rust uses the same cross-anchor offsets; this diagnostic does not change either engine or establish the cause of match losses.'};
await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({connections:[example.legacyConnections,reflected.legacyConnections],observedMismatch:result.observedMismatch}));
