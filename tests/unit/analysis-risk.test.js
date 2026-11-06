import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisRisk} from '../../src/ai/analysis-risk.js';
test('risk warnings distinguish exact endings, selective mate scores and goal exposure',()=>{
 assert.match(analysisRisk({exact:true,outcome:-1},0),/완전 해법/);assert.equal(analysisRisk({exact:true,outcome:1,score:-30000},0),'');
 assert.match(analysisRisk({score:-29988},0),/제한 시간/);assert.match(analysisRisk({score:83,goalSafety:{goalThreat:true,wallStock:[2,3]}},0),/상대 벽 3개/);
 assert.match(analysisRisk({score:-300},1),/승률이 아닙니다/);assert.equal(analysisRisk({score:100},0),'');
});
