import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisDepth,analysisMetadata,analysisError} from '../../src/ui/analysis-presentation.js';
import {normalizeSessionSettings} from '../../src/history/session-settings.js';
test('unavailable engine statistics do not fabricate zero counts or depth',()=>{
 const r={done:true};assert.equal(analysisDepth(r),'');assert.equal(analysisMetadata(r),'분석 완료');
 assert.doesNotMatch(analysisMetadata({done:true,nodes:0,elapsedMs:NaN}),/NaN|0개 노드|undefined/);
 assert.match(analysisMetadata({done:true,elapsedMs:430,simulations:180}),/0.43초 · 180회 탐색/);
});
test('personal supported engine and quick setting survive startup; unsupported long options migrate safely',()=>{
 const data={settingsRevision:1,engine:'sigma3',time:'500',mode:'ai',records:[]};
 const r=normalizeSessionSettings(data,{startup:true});assert.equal(r.engine,'sigma3');assert.equal(r.mode,'ai');assert.equal(r.time,'500');
 assert.equal(normalizeSessionSettings({...data,time:'30000'}).time,'variable');
});
test('transport and version errors tell the user how to recover',()=>{
 assert.match(analysisError(new Error('Sigma engine unavailable (503)')),/앱을 실행한 뒤 다시 분석/);
 assert.match(analysisError(new Error('Engine build does not match')),/실행기를 다시/);
 assert.doesNotMatch(analysisError(new Error('TypeError: opaque stack')),/TypeError/);
});
