import {readFile,writeFile} from 'node:fs/promises';
const folder='reports/engine-comparison-20261106';
const run=JSON.parse(await readFile(folder+'/results.json','utf8'));
const audit=JSON.parse(await readFile(folder+'/audit.json','utf8'));
if(!run.finishedAt||audit.partial||audit.checkedGames!==run.games.length)throw Error('Comparison and independent audit must both be complete');
const pct=x=>`${(100*x).toFixed(1)}%`,num=x=>x.toFixed(1);
const compact={createdAt:run.createdAt,finishedAt:run.finishedAt,config:run.config,fixtureSources:run.fixtures.map(f=>({id:f.id,phase:f.phase,hash:f.hash})),pilot:run.pilot,followupPairs:run.followupPairs,summary:run.summary,decision:run.decision,audit};
await writeFile('evaluation/sigma-engine-comparison-20261106.json',JSON.stringify(compact,null,2));
const lines=['# Sigma 2·3·4 현재 배포판 비교 — 2026-11-06','',
`총 ${run.games.length}판. 실제 로컬 HTTP 서비스와 AdaptiveEngine 경로를 사용했습니다. 각 수의 탐색 예산은 0.5초, 상한은 200회입니다.`,
'','## 대국 결과','',
'| 조합 | 앞 엔진 승 | 뒤 엔진 승 | 반복 종료 | 미완료/오류 | 앞 엔진 득점률 |',
'|---|---:|---:|---:|---:|---:|',
...run.summary.map(p=>`| ${p.a} vs ${p.b} | ${p.winsA} | ${p.winsB} | ${p.draws} | ${p.cutoffs+p.errors} | ${pct(p.scoreA)} |`),
'','득점률은 승리 1, 반복 종료 0.5, 패배 0으로 계산합니다. 진행 제한 종료와 실행 오류는 실력 승패에 합산하지 않습니다. 반복 종료는 앱 관전의 3회 반복 규칙이며 쿼리도 공식 무승부 판정을 주장하지 않습니다.',
'','## 응답 시간과 탐색량','',
'| 엔진 | 승-패-반복 | 평균 응답 | p95 응답 | 평균 완료 탐색량 | 500ms 초과 |',
'|---|---|---:|---:|---:|---:|',
...Object.entries(audit.metrics).map(([id,m])=>`| ${id} | ${m.wins}-${m.losses}-${m.repetitionDraws} | ${num(m.meanMs)}ms | ${num(m.p95Ms)}ms | ${num(m.meanSimulations)} | ${m.over500ms}/${m.moves} |`),
'','측정은 초기 모델 로딩 이후의 요청부터 결과 수신까지입니다. 합법 수 생성, 전송, 결과 선택 비용을 포함하고 화면 인식·브라우저 렌더링은 포함하지 않습니다. CPU와 OS 스케줄링에 따라 재실행 결과가 달라질 수 있습니다.',
'','## 판정','',
`- 기존 기본값 유지: ${run.decision.defaultEngine} (최강 판정이나 승격을 의미하지 않음)`,
`- 확실한 강자 기준을 충족한 엔진: ${run.decision.strongest??'없음'}`,
`- 두 상대 모두에 대한 명확한 열세 기준 통과: ${run.decision.weakest??'없음'}`,
`- 삭제 근거 충족: ${run.decision.removalEvidencePassed?'예':'아니오'}`,
'','삭제 근거는 두 상대 모두가 해당 엔진에 대해 65% 이상 득점하고, 배치별 선후공 두 판을 묶은 단측 부호 비교가 0.05/3 이하이며, 미완료·오류가 없는 조건입니다. 임의로 기준을 낮춰 숫자상 최하를 삭제하지 않습니다. 이 문턱은 제한된 선택 배치에 대한 탐색적 판단이며 전체 쿼리도 실력의 통계적 인증이 아닙니다.',
'','## 비교 조건과 한계','',
'- 최초 6개 배치 × 선후공 교대 × 세 조합 = 36판으로 선별했습니다. 불명확한 조합에만 미리 정한 추가 6개 배치를 적용했습니다.',
'- 각 대국은 새 worker로 시작하고, 모델을 미리 로드한 뒤 한 수씩 순차 계산했습니다. 대국 안에서의 트리·신경망 캐시는 실제 배포 정책을 유지했습니다.',
'- 초반·중반·미로·종반을 포함하지만 기존 Sigma 대국 자료에서 고른 고정 배치입니다. 같은 원본 게임이나 비슷한 수순에서 나온 배치는 서로 상관될 수 있습니다. 서로 다른 배치 수를 완전히 독립적인 게임 수로 해석하지 않습니다.',
'- 최신 변경으로 세 엔진 모두 시간 제한과 빠른 벽 판정·입력 캐시를 사용합니다. 이전 고정 200회 대전 성적과 그대로 합산하지 않습니다.',
'- 전체 수순을 별도 감사 코드로 재생해 합법 수·승자·중복 대국 키·현재 소스 일치를 확인했습니다.',
'','## 재현','',
'```powershell','node scripts/compare-sigma-engines.mjs','node scripts/audit-sigma-comparison.mjs','node scripts/report-sigma-comparison.mjs','```',
'','전체 수순은 `reports/engine-comparison-20261106/results.json`, 감사 결과는 같은 폴더의 `audit.json`입니다. 생성 보고서는 Git에서 기본 제외됩니다. 요약과 코드 식별값은 `evaluation/sigma-engine-comparison-20261106.json`에 보존합니다. 소스나 조건이 달라지면 기존 결과에 이어서 실행하지 못하도록 검사합니다.',
'',`고정 코드 식별값: \`${run.config.fingerprint}\``,''];
await writeFile('docs/SIGMA_ENGINE_COMPARISON_20261106.md',lines.join('\n'));
console.log(JSON.stringify(run.decision));
