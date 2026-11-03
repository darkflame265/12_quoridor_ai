import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal} from '../src/engine.js';
const [fixture] = JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8')).slice(1,2);
process.env.SIGMA_DIAGNOSTICS = '1';
process.env.SIGMA_SEED = '20261103';
process.env.SIGMA_EXPLORATION = '0.15';
for (const active of [true,false]) {
  process.env.SIGMA3_FOCUS=active?'1':'0';
  const agent=new SigmaProcess({variant:'sigma3'});
  try {
    const result=await agent.search({...fixture.s,historyStates:fixture.history.slice(-48)});
    const focus=result.diagnostics?.loopDebug?.sigma3Focus;
    assert.equal(result.simulations,200);
    assert.ok(legal(fixture.s,result.pv[0]));
    assert.ok(focus);
    if(active)assert.equal(focus.focused,40,'experimental search must allocate 40 simulations');
    else assert.equal(focus.focused,0,'production search must not focus');
    console.log('PASS',active?'experimental':'production',JSON.stringify(focus),JSON.stringify(result.pv[0]));
  }finally{await agent.close()}
}
