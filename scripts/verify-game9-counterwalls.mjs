import fs from 'node:fs';
import {createLimitedWallSolver} from '../evaluation/limited-wall-oracle.mjs';
import {apply,legal,notation} from '../src/engine.js';
const game=JSON.parse(fs.readFileSync('evaluation/fixtures/game9-record.json','utf8'));
let state=game.baseState;for(const a of game.records.slice(0,48))state=apply(state,a);
const solver=createLimitedWallSolver({onProgress:r=>console.log(JSON.stringify(r))}),rows=[];
for(const [a,reply]of [[game.records[48],game.records[49]],[{type:'move',x:1,y:2},{type:'wall',o:'v',x:1,y:2}]]){
 if(!legal(state,a))throw Error('Illegal proposed alternative');
 const child=apply(state,a);if(!legal(child,reply))throw Error('Illegal counterwall');
 const end=apply(child,reply),table=solver.solve(end),outcome=table.lookup(end.p[0].y*9+end.p[0].x,end.p[1].y*9+end.p[1].x,end.turn);
 const row={ply:49,action:notation(a),opponentReply:notation(reply),outcome,method:'Opponent has zero walls after this reply, user has two. Exact bounded-wall outcomes, not a depth-limited score.'};
 rows.push(row);console.log(JSON.stringify(row));
 fs.writeFileSync('evaluation/game9-improvements/counterwalls.json',JSON.stringify(rows,null,2));
}
