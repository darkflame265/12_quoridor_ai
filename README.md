# Quoridor AI Studio

개인용 쿼리도 대전·분석 앱.

GitHub 비공개 저장소: [darkflame265/12_quoridor_ai](https://github.com/darkflame265/12_quoridor_ai)

## 실행

```powershell
npm install
npm run dev
```

http://127.0.0.1:5173/ 에 접속합니다.

기본 `Atlas 5 Auto`는 로컬 네이티브 Rust 서비스를 우선 사용합니다. `npm run dev`가 네이티브 엔진을 빌드하고 서비스를 함께 실행합니다. Rust 1.99.1이 필요하며, 빌드나 서비스 연결이 실패하면 기존 WASM 엔진으로 자동 전환합니다. 이미 켜 둔 개발 서버는 재시작하세요. 브라우저 분석에 `Native Rust ×4`가 표시되면 새 엔진입니다. 기존 관전 설정이 Atlas 4라면 **Atlas 5 Auto**를 선택하세요.

새 설정의 생각 시간은 0.5초, 관전 계산 코어는 4개입니다. 브라우저에 저장된 사용자 설정은 유지합니다. 상세 측정과 GPU 사용 범위는 [고속 엔진 검증 기록](reports/FAST_ENGINE.md)에 있습니다.

- 내 차례에 표시되는 점을 클릭하면 이동합니다.
- 칸 사이 틈에 커서를 대면 두 칸 길이의 벽이 미리 표시됩니다. 밝은 벽은 설치 가능, 붉은 벽은 설치 불가입니다. 클릭으로 확정합니다.
- AI 대전 / 양쪽 직접 조작, 진영 및 생각 시간을 선택할 수 있습니다.
- 최선 수 분석은 현재 차례의 추천 수와 예상 진행을 표시합니다.
- 무르기 후 다른 수를 두어 분기를 시뮬레이션할 수 있습니다.
- 기보는 자동으로 브라우저에 보관되며 JSON 파일로 저장·복원할 수 있습니다.

## AI vs AI 관전

모드를 **AI vs AI 관전**으로 바꾸고 양쪽 엔진을 설정한 다음 **시작 / 계속**을 누릅니다. Atlas 5 Auto, Atlas 4 Rust/WASM과 이전 Atlas 3 JavaScript를 선택할 수 있습니다. 양쪽에 동일한 엔진을 지정해도 됩니다.

- 청록·분홍 각각 생각 시간(0.1~30초)과 계산 코어를 선택합니다. Atlas 5와 Atlas 4는 1~4코어, Atlas 3는 1코어입니다.
- **일시정지**는 수 사이의 대기뿐 아니라 진행 중인 계산도 취소합니다. 취소된 계산의 늦은 결과는 적용하지 않습니다.
- **한 수 진행**은 현재 차례의 AI가 정확히 한 수만 두고 다시 일시정지합니다.
- 수 사이 간격을 0 / 0.35 / 0.75 / 1.5초로 설정할 수 있습니다. 엔진·시간·코어·간격을 변경하면 자동으로 일시정지하므로 계속하려면 시작을 다시 누릅니다.
- 금색 칸·이동 흔적 또는 벽 테두리가 방금 둔 수를 표시합니다. 분석 영역에는 선택한 수, 예상 진행과 실제 엔진·계산량을 표시합니다.
- **무르기**는 관전을 일시정지하고 한 수 되돌립니다. **새 게임**도 관전에서는 일시정지 상태로 준비합니다. 관전 중 말이나 벽을 직접 클릭해 두지는 않습니다.
- 목표선 도착은 승리로, 동일 배치 3회 반복 또는 전체 300수 제한은 **관전용 무승부**로 표시합니다. 일반 플레이의 합법 수나 승리 규칙을 바꾸지 않습니다.
- **저장**은 전체 기보와 관전 설정을 `quoridor-ai-vs-ai.json`으로 내보냅니다. 새 형식과 기존 `records` 형식을 모두 불러올 수 있습니다. 관전 기보를 불러오거나 페이지를 새로고침하면 항상 일시정지 상태입니다.

이 화면은 현재 엔진끼리 플레이하는 모습을 보여 줍니다. 관전 자체가 신경망 학습을 실행하거나 가중치를 갱신하지는 않습니다. 연속 대국 승패 집계와 저장 기보의 전후 재생은 이후 확장 대상입니다.

## 검증

```powershell
npm test
npm run build
```

## AI 범위

현재 기본 엔진은 **Atlas 5 Auto**입니다. 네이티브 Rust에서 1~4코어가 탐색 캐시와 작업 큐를 공유합니다. 네이티브 서비스를 사용할 수 없으면 **Atlas 4 Rust/WASM**으로 복귀합니다. `public/atlas.wasm`을 포함하므로 WASM 플레이에는 Rust나 Python이 필요 없습니다. WASM 소스를 다시 빌드할 때는 Rust 1.99.1과 `wasm32-unknown-unknown` 대상이 필요합니다. WASM 로딩까지 실패하면 `JS fallback`을 표시하고 Atlas 3.1 JavaScript 엔진을 사용합니다. GPU는 실전 기본 탐색에 사용하지 않습니다.

```powershell
npm run wasm:build
cargo test --manifest-path rust-engine/Cargo.toml
```

WASM의 합법 수와 전략 점수를 독립적인 JavaScript 구현에 대조하고, 소스·산출물 SHA-256을 `public/atlas-wasm.json`에 기록합니다. 코드 이식이 항상 실력 향상을 뜻하지는 않습니다. 상세 결과와 제한은 [Atlas 4 검증 기록](reports/ATLAS4.md)을 참고하세요.

- 81개 칸의 인접 연결 배열과 128개 벽 자리로 검색 상태를 표현합니다.
- 검색 중 수 적용·되돌리기를 사용하고 매번 전체 상태를 복사하지 않습니다.
- 반복 심화, 알파베타/PVS, 해시 기반 상태 캐시, 이전 최선 수·킬러 수·히스토리 정렬을 사용합니다. 해시 충돌은 전체 상태 서명으로 검증합니다.
- 고정 상위 N개 후보를 제외하는 방식은 없앴습니다. 모든 합법 수를 생성하고, 후순위 수는 얕은 탐색에서 개선이 발견되면 원래 깊이로 다시 읽습니다. 선택적 심화이므로 일반 국면에서 최적 수를 증명하지는 않습니다.
- 즉시 승리와 점프 승리를 우선 확인하고, 상대의 즉시 승리가 보이는 탐색 말단은 방어를 더 읽습니다.
- 도착 거리, 근접 시 상대 말/점프, 대체 출구, 남은 벽의 가치를 평가합니다. 멀리 떨어진 말의 장기 상호작용과 벽의 장기 전략은 여전히 근사합니다.
- Atlas 3는 최단 경로 가지에서 상대가 놓을 수 있는 벽 위협을 최대 4개 표본으로 평가합니다. 공격으로 얻는 우회 거리에서 자기 경로 손해와 벽 설치에 쓰는 한 차례를 빼서 평가하고, 경로를 완전히 막는 불법 설치는 제외합니다. 이는 모든 벽 조합의 완전 탐색이 아닙니다.
- 마지막 방어용 벽의 가치를 여분의 열 번째 벽보다 높게 평가합니다. 벽을 모두 일찍 소진하는 성향을 줄이기 위한 비선형 자원 평가입니다.
- 기존 벽의 끝과 연결되는 설치 수를 우선 정렬하고 탐색 깊이 축소를 피합니다. 여러 턴에 걸친 벽 조합은 실제 게임 트리에서 읽으며, 전략 평가가 연결 벽을 더 일찍 고려하도록 돕습니다.
- 탐색 내부 반복은 중립 평가합니다. 일반 게임에 반복 무승부 규칙을 추가하지 않습니다.
- **양쪽 벽이 0개면 고정된 미로의 모든 말 위치와 차례를 역산**합니다. 이때만 화면에 정확한 승리·패배·무승부를 표시합니다. 이론적 무승부는 무한 반복을 피할 수 없는 경우를 뜻합니다. 예산 내 계산이 끝나지 않으면 일반 탐색으로 복귀합니다.
- Atlas 5는 우선 후보를 먼저 읽고 남은 루트 수를 공유 작업 큐에서 가져옵니다. 전이표·평가·합법 수 정렬 캐시와 좌우 대칭 배치를 재사용합니다. 한 깊이의 전체 루트 처리가 끝난 결과만 확정합니다. 취소해도 네이티브 프로세스와 캐시는 유지하고 오래된 결과는 버립니다. Atlas 4의 Worker 분할 방식도 비교용으로 보존했습니다.
- 내 차례에는 네이티브 연결 시 최대 1.5초, WASM은 250ms의 사전 계산으로 다음 수의 캐시를 준비합니다. 조작하면 계산을 취소하고 응수를 계산합니다.
- 생각 시간은 0.5 / 2 / 5 / 15 / 30초이며 새 설정 기본값은 0.5초입니다. 단일 규칙 생성 작업 때문에 시간이 약간 초과할 수 있습니다.

`src/engine.js`는 화면·저장 기보 검증을 위한 독립적인 규칙 구현입니다. `src/search.js`의 최적화된 규칙과 무작위 합법 상태에서 대조합니다. 기보 좌표와 내 진영이 화면 위에 보이는 방향은 유지됩니다.

## 자동 대전 평가

```powershell
npm run benchmark -- --ms 100 --pairs 4 --max-plies 140
```

같은 시작 배치에서 두 엔진의 진영을 교환해 대전합니다. 처음 한 쌍은 표준 시작이고 나머지는 고정 시드로 생성한 벽/이동 배치입니다. 첫 엔진은 `src/legacy-ai.js`, 이번 변경 전 Atlas 2는 `src/baselines/atlas2.js`에 보존했습니다. 각 수의 합법성을 독립 규칙으로 검증하고, 전체 기보·평균 탐색 깊이·노드 수·실제 계산 시간을 `reports/benchmark-latest.json`에 저장합니다.

### 개발·검증·최종 확인 분리

```powershell
npm run evaluate -- --split development --opponent atlas2 --pairs 8 --ms 150
npm run evaluate -- --split validation --opponent atlas2 --pairs 6 --ms 150
npm run evaluate -- --split holdout --opponent atlas2 --pairs 8 --ms 200
```

각 명령은 새 보고서 폴더를 만듭니다. 명시적인 `--out <폴더>`도 지원하며 기존 보고서를 덮어쓰지 않습니다. 표준 시작 배치 한 쌍은 공통 기준이고 나머지는 분리된 고정 시드를 사용합니다. 레이스·이동/벽 혼합·벽이 많은 배치를 포함하고 각 배치의 진영을 교환합니다. 서로 다른 시드여도 비슷한 쉬운 배치가 나올 수 있으므로 독립적인 전문가 평가를 대체하지 않습니다. `--opponent legacy` 및 `--opponent shortest`도 지원합니다.

보고서는 다음을 포함합니다.

- `SUMMARY.md`, `report.json`: 승패, 배치 유형별 성적, 전술 문제 16개, 계산량·실제 시간·시간 초과, 소스 SHA-256.
- `games/*.json`: 게임에서 그대로 불러올 수 있는 기보와 각 수의 점수·예상 진행·탐색 깊이. 진행 중인 대국을 덮어쓰지 않으려면 먼저 저장하세요.
- 진행 중에도 대국마다 기록을 남기며 완료 여부는 대국 수와 `status`로 확인합니다. 무승부를 승리로 합산하지 않습니다.

```powershell
npm run analyze-losses -- --report reports/atlas3-validation/report.json --ms 1000 --limit 6
```

패배 대국의 평가 변화가 큰 수를 골라 실제로 둔 수와 추천 수의 후속 진행을 같은 시간으로 다시 분석합니다. `analysis/losses.md`, `analysis/losses.json`과 해당 수 직전으로 되돌린 `analysis/positions/*.json`을 생성합니다. 같은 수가 다시 추천되면 후회 점수는 0으로 표시합니다. 깊이가 다른 근사 탐색의 점수 차이이므로 확정적인 패착 판정은 아닙니다.

```powershell
node scripts/promote.mjs --validation reports/atlas3-validation/report.json --holdout reports/atlas3-holdout/report.json --apply
```

기본 엔진 교체는 검증/최종 확인의 완료, 동일한 후보 코드, Atlas 2 비교, 최소 표본, 모든 전술 통과, 검증 성적 비퇴보, 최종 확인의 승수 우위, 시간 초과율과 기보 합법성을 확인합니다. 통과하지 않으면 Worker import를 바꾸지 않습니다. 이 기준은 소규모 출시 확인이며 통계적으로 확정된 실력 우위나 초인적 수준의 인증이 아닙니다. 최종 확인 결과를 보고 코드를 조정했다면 새 최종 확인 시드를 정해서 다시 검증해야 합니다.

위 `promote.mjs` 명령은 이전 Atlas 3의 JavaScript 교체 검사 도구로 보존한 것입니다. 현재 Atlas 4의 산출물·대국 검증은 `node scripts/verify-release.mjs`로 수행합니다.

평가에서만 같은 상태 3회 반복 또는 수 제한을 무승부로 처리하며, 실제 게임의 승리 규칙은 바꾸지 않습니다. 시간제 탐색이므로 같은 시드라도 컴퓨터 부하에 따라 결과가 달라질 수 있습니다. 짧은 대전과 이전 엔진과의 승률은 인간 최상위 수준의 증거가 아닙니다. 평가 배치에 맞춘 조정 후에는 별도 시드/배치로 검증해야 합니다.

## 미로·WASM·외부 엔진 비교

```powershell
npm run evaluate -- --backend wasm --suite maze --split holdout --opponent atlas3 --pairs 6 --ms 150
npm run external:setup
npm run evaluate -- --backend wasm --split holdout --opponent gorisanson --pairs 4 --ms 500
```

외부 엔진은 [gorisanson/quoridor-ai](https://github.com/gorisanson/quoridor-ai)의 MIT 구현이며 커밋 `e15d6e7825e6f7c2f3a41de0ecef1af7aa290f1e`로 고정했습니다. 별도 `.external/`에 받고 Git에는 원본 소스를 재배포하지 않습니다. 어댑터는 원본 UCT MCTS를 8회 롤아웃 단위로 실행하고 단위 사이에서 시간을 확인합니다. 두 엔진의 실제 시간을 보고서에 기록합니다. 외부 엔진 한 개에 대한 소규모 승률은 인간 최상위 수준의 인증이 아닙니다.

## AlphaZero 방식의 학습 기반

Python 3.10 이상과 `training/requirements.txt`의 PyTorch·NumPy가 필요합니다. 이 PC에서는 Python 3.14, PyTorch 2.9.1 CPU로 실행 검증했습니다.

```powershell
python -m pip install -r training/requirements.txt
npm run train:test
python training/train.py --out training/runs/local --iterations 1 --games 4 --simulations 24
```

입력은 현재 차례 기준으로 정규화한 292개 값이고, 정책은 209개 행동, 가치는 승패 평가 1개입니다. PUCT MCTS의 방문 분포를 정책 목표로, 자가대국 승패를 가치 목표로 사용합니다. 불법 수는 제외하고 학습 중에만 루트 탐험 노이즈를 넣습니다. 기본 `--bootstrap 0.8`은 초기 진행을 돕는 명시적인 경로 휴리스틱 혼합이며 회차마다 감소합니다. `--bootstrap 0`으로 휴리스틱 혼합을 끌 수 있습니다. 즉시 승리·패배 방어 검사는 탐색에 유지됩니다. 원 논문의 대규모 AlphaZero 실험을 재현했다는 의미는 아닙니다.

학습 데이터는 개발 시드의 자가대국에서 만들고 검증·최종 확인 시드는 분리합니다. 수 제한에 도달한 미완료 대국은 기록하되 학습 승패 라벨에서 제외합니다. 반복 대국은 학습용 무승부로 처리하며 실제 앱 규칙은 바꾸지 않습니다.

```powershell
python training/train.py --out training/runs/continued --resume models/bootstrap-checkpoint.pt --iterations 10 --games 16 --simulations 128 --arena-pairs 10
```

체크포인트에는 가중치, 옵티마이저, 회차, 재현용 난수 상태, 리플레이 버퍼가 있습니다. 현재 챔피언과 과거 스냅샷, Rust 기준 엔진에 대전하고 전술 검증을 수행합니다. 최소 대국 수와 승률 하한 기준, 별도 최종 확인을 통과할 때만 **학습 리그의 챔피언**을 갱신합니다. 기본 앱 엔진을 약한 후보로 자동 교체하지 않습니다. 실제 게임에 신경망을 기본 탑재하는 결정은 별도의 장시간·강도 검증이 필요합니다.

```powershell
python training/export.py --checkpoint training/runs/local/checkpoint.pt --report training/runs/local/report.json --out models
python training/analyze.py --checkpoint models/bootstrap-checkpoint.pt --game reports/training-initial/games/iteration-0-game-0.json --simulations 128
```

`models/candidate.json`은 초기 학습 모델이고 `models/registry.json`의 `active`는 `null`입니다. 챔피언 승격에 실패했으므로 플레이 기본값은 Rust/WASM입니다. PyTorch와 JavaScript 추론 결과를 비교하는 테스트도 포함합니다. 실행 로그·일반 체크포인트는 `training/runs/`에 보관해 Git에서 제외하고, 재개 검증용 체크포인트 하나와 초기 모델·보고서는 Git에 포함합니다.

남은 실력 검증: 장시간 자가대국과 충분한 학습량, 더 강한 독립 엔진 및 숙련자와의 평가, 미로 대국의 확실한 승률 개선. 화면 확장 대상은 임의 배치 편집기, 추천 수 상위 3개, 독립 분기 트리입니다.
