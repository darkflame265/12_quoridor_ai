# 교정 연결도의 정렬·평가 적용 위치 분리

벽 연결도의 기하 정의를 교정한 이전 후보는 validation 6승 6패로 실전 채택되지 않았습니다. 이번에는 연결도를 어디에 적용하는지 분리해, 수 정렬과 평가·위협 후보 선택의 영향을 비교합니다. 기존 Atlas 5.3은 비교 기준과 실전 기본값으로 보존합니다.

## 적용 위치

| `--geometry` | 수 정렬 연결도 | 평가·위협 후보 순위 | 기존 연결 벽 깊이 축소 예외 |
| --- | --- | --- | --- |
| legacy | 기존 | 기존 | 기존 |
| rank-only | 교정 | 기존 | 기존 |
| eval-only | 기존 | 교정 | 기존 |
| rank-eval | 교정 | 교정 | 기존 |
| physical | 교정 | 교정 | 교정 |

실제 비교는 `legacy`, `rank-only`, `rank-eval`이며 정적 평가 모드 `cache4`, 탐색 모드 `legacy`로 고정합니다. 별도의 `protected` 깊이 보호와 함께 바꾸지 않습니다. 표의 깊이 기준은 기존 연결 벽의 깊이 축소 예외를 뜻하며, 정렬이 달라져서 검색 순서·완료 깊이가 달라질 수는 있습니다.

기존에는 하나의 함수가 정렬, 정적 평가의 위협 후보 4개 선택, 깊이 축소 예외에서 함께 쓰였습니다. 빌드 연결 지점과 호출 함수를 분리해 `rank-only`가 평가까지 바꾸거나 `rank-eval`이 깊이 예외까지 바꾸지 않도록 했습니다. 기존 `physical` 모드는 이전 전체 적용 방식의 재현용으로 유지합니다.

모든 합법 수, 기존 점수 계수, 검색의 재탐색, 정확한 종반 규칙은 유지합니다. 원본 엔진을 수정하지 않고 별도 후보 `Atlas 5.8 experiment`에서 실행합니다.

## 실제 호출로 분리 검증

컴파일한 Rust 실행 파일을 다섯 모드로 각각 실행해 16,384개 벽 쌍과 적용 위치 세 곳을 대조했습니다. 총 **245,760개** 확인에서 지정한 위치에만 기존·교정 계산이 적용됐습니다.

이전에 노출된 합법 상태 167개에서도 원래 평가 점수와 캐시 평가 점수를 비교했습니다.

- `rank-only`와 `legacy`의 정적 평가 점수는 모두 같습니다.
- 평가를 교정한 세 모드의 정적 평가 점수는 서로 같습니다.
- 평가 교정으로 캐시 평가 점수가 달라진 상태는 28개입니다.

이는 실제 실행 파일의 함수 경로와 출력에 대한 확인입니다. 점수가 같다는 것이 시간 제한 검색의 첫 수나 승패도 같다는 의미는 아닙니다.

- [적용 위치·점수·입력·바이너리 해시 검증](geometry58/scope-proof.json)

## 새 배치와 개발 비교

`search58-v1` 시드는 개발 849193, validation 293761, holdout 637499입니다. 이전 Native v3 및 search55~57, 새 분리 사이의 중복을 제외합니다. 배치 생성은 먼저 짧은 접두부를 검사하고 부족할 때만 늘리도록 해 불필요한 생성을 줄였습니다. 이전에 평가한 validation 기보의 시작 접두부가 바뀌지 않았는지 별도 테스트합니다.

새 일반·미로 각 한 배치에서 진영을 교환한 개발 4판씩을, 같은 500ms·4코어·최대 180수로 고정된 Atlas 5.3과 비교했습니다.

| 연결도 적용 | 성적 |
| --- | --- |
| legacy 대조군 | 1승 3패 |
| rank-only | 2승 2패 |
| rank-eval | 2승 2패 |

모두 전술 16/16을 통과했습니다. 작은 표본에서 정렬 전용과 평가 포함의 승패 차이는 확인되지 않았습니다. 기존 점수를 유지하는 단순한 변경인 rank-only를 별도 validation 대상으로 선택했습니다. 개발 성적만으로 강도 향상이나 평가 교정의 불필요함을 결론 내리지 않습니다.

- [세 모드 비교와 전체 기보](geometry58/comparison.json)
- [개발 12판 재검증](geometry58/verification.json)

## 정렬 전용 후보의 validation 결과

새 validation 일반·미로 각 3배치의 진영을 교환해 12판을 실행했습니다. 조건은 동일한 500ms·4코어·최대 180수입니다.

| 배치 | 성적 |
| --- | --- |
| 일반 6판 | 2승 2패 2무 |
| 미로 6판 | 3승 3패 |
| 합계 | 5승 5패 2무 |

무승부 두 판은 반복 종료입니다. 전술 16/16, 시간 초과 0개, 배치별 비퇴행 기준은 통과했지만 전체 양의 승패 차 기준은 통과하지 못했습니다. 실전 채택을 보류했고 새 holdout 대전은 실행하지 않았습니다. 현재 게임의 기본 엔진은 Atlas 5.3입니다.

평가 점수 보존과 적용 위치 분리는 정상 동작하지만 실제 대전 우위를 입증한 결과는 아닙니다. 정렬 전용과 평가 포함의 개발 성적이 같았다는 사실도 평가 교정이 불필요하다는 결론은 아닙니다. 다음에는 정렬 계수와 평가의 위협 후보 선택 가중치를 따로 조정해야 합니다.

- [validation 12판](geometry58/rank-only-validation/report.json)
- [validation 기보·시간 재검증](geometry58/rank-only-validation/verification.json)
- [채택 보류와 holdout 보존 기록](geometry58/decision.json)

Rust 테스트 22개를 `rank-only`와 `rank-eval`에서 각각 통과했고, 앱 테스트 70개·빌드·총 24판 기보 검증도 통과했습니다. 이전 validation 시작 배치가 생성 최적화로 바뀌지 않았다는 테스트와 원본 Atlas 5.3의 종반 진단도 통과했습니다.

## 실행

```powershell
npm run maze:build
npm run maze:check-scopes -- reports/geometry58/my-scope-proof.json
npm run maze:compare-geometry -- reports/geometry58/my-comparison
node scripts/verify-geometry.mjs reports/geometry58/my-comparison
```

비교 기본값은 `legacy,rank-only,rank-eval`과 `search58-v1`입니다. `--geometries`와 `--cohort`를 명시해 바꿀 수 있습니다. 새 출력 경로를 사용합니다.

```powershell
npm run maze:evaluate -- --out reports/geometry58/my-validation --mode cache4 --search legacy --geometry rank-only --cohort search58-v1 --split validation --pairs 3
```

서로 다른 연결도 적용 모드나 배치군의 validation·holdout은 채택 기준에서 혼합하지 않습니다. 이전 실행 결과는 해당 커밋의 소스·바이너리 해시 기록으로 보존합니다.

## 남은 추천 우선순위

1. 교정 연결도의 정렬 계수와 위협 후보 선택 가중치를 독립 조정.
2. 캐시 조회·중복 경로 계산·기준 방향 변환 비용 최적화.
3. 깊이 보호 범위를 실제 강제 수에 맞춰 재검증.
4. 새로운 미사용 배치·외부 엔진에서 우위를 확인한 후보만 채택.
5. 강해진 엔진으로 신경망 지도 자료·학습 재검토.
