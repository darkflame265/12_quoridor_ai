# Atlas 5.3 지도 자료로 CNN 보강

Native Atlas 5.3끼리 둔 일반·벽 미로 대국에서 정책과 가치의 지도 자료를 수집하고 기존 CNN을 보강하는 경로를 추가했습니다. 학습은 RTX 3060 Ti의 CUDA PyTorch로 실행했습니다. 실전 기본 엔진은 기존 Atlas 5.3입니다.

## 자료와 학습 방식

- 승인된 Atlas 5.3으로 일반 16판, 미로 16판을 수집했습니다. 지도 엔진은 수당 30ms·4코어입니다. 실전 비교의 500ms보다 짧은 조건이며 완벽한 최선 수를 보장하는 정답은 아닙니다.
- 32판 모두 목표선 도착으로 끝났고 총 1,529개 상태를 만들었습니다. 수 제한으로 끝난 대국은 학습에서 제외합니다. 기보는 독립 JavaScript 규칙으로 검증합니다.
- 일반·미로 각각 3판씩, 총 6판 317개 상태를 검증에 보관했습니다. 나머지 1,212개 상태를 좌우 대칭으로 늘려 2,424개 학습 상태를 사용했습니다. 현재 학습과 검증 사이의 원본·대칭 상태 중복은 0개입니다.
- 정책은 지도 엔진이 실제 선택한 수를 정답으로 사용하고 불법 수를 손실 계산에서 마스킹합니다. MCTS 방문 분포를 흉내 낸 자료는 아닙니다.
- 가치 목표는 실제 최종 승패와 `tanh(Native 평가 점수 / 700)`을 각각 절반 섞었습니다. 이는 휴리스틱을 전달하기 위한 학습 목표이며 보정된 승률이 아닙니다. 실제 승패 MSE도 따로 기록해 목표 변경만으로 좋아진 것처럼 보이지 않도록 합니다.
- 기존 CNN 가중치에서 학습을 시작했습니다. 검증 분리는 이번 보강 학습에 적용되며, 기존 모델의 모든 과거 학습 상태와 독립적임을 인증하는 시험은 아닙니다.

## 실제 학습 결과

| 검증 지표 | 기존 CNN | 선택된 보강 CNN |
| --- | ---: | ---: |
| 정책 손실 | 2.5196 | 1.7809 |
| 혼합 가치 목표 MSE | 1.1315 | 0.6501 |
| 실제 최종 승패 MSE | 1.3258 | 0.9231 |
| 지도 엔진과 최상위 수 일치율 | 39.43% | 45.74% |
| 합산 학습 목표 손실 | 3.6511 | 2.4310 |

가치를 항상 0으로 예측하는 실제 승패 MSE는 1.0입니다. 20회 학습 중 검증 손실이 가장 낮았던 1회차를 선택했습니다. 이후 검증 손실은 상승해 마지막에는 4.6539였으며 과적합이 관찰됐습니다. 마지막 모델로 무조건 교체하지 않습니다. 작은 검증 자료의 지표 개선이 대전 실력 개선을 보장하지는 않습니다.

저장 모델을 CPU에서 다시 불러와 자료 분리와 지표를 재계산했습니다. CPU·GPU 추론 최대 오차는 약 0.00000456입니다.

## 실제 동일 시간 대전

수당 500ms, Native 4코어, 일반·미로 각 한 배치에서 진영을 교환해 총 8판을 실행했습니다. 과거 신경망 상대는 이번 보강 전 CNN입니다.

| 상대 | 보강 CNN 결과 |
| --- | --- |
| Atlas 5.3 Native Rust | 0승 3패 1무 |
| 보강 전 CNN | 1승 3무 |

전술 문제는 16/16 통과했고 양쪽 시간 초과는 0개였습니다. 무승부 4판은 반복 종료이며 수 제한 종료는 없습니다. 후보를 채택하지 않았고 holdout도 열지 않았습니다. 작은 표본이며 기존 평가에서 사용한 시작 배치를 재사용한 개발 확인이므로 실력 인증이 아닙니다. 실제 Native 상대 성적은 여전히 개선이 확인되지 않았습니다.

- [대전 보고서와 수별 시간](teacher-learning/league-500ms/report.json)
- [후보 채택 보류 기록](teacher-learning/league-500ms/selection.json)

앱 테스트 63개, Python/GPU 테스트 26개와 빌드를 통과했습니다. 원본·대칭 상태 분리, 수·벽 좌우 반사, 진영별 승패 부호를 자동 검증하고 32판 자료와 8판 평가 기보를 다시 확인했습니다.

- [자료·기보 목록](teacher-learning/dataset-v1/manifest.json)
- [20회 학습 보고서](teacher-learning/training-report.json)
- [재계산과 CPU·GPU 검증](teacher-learning/verification.json)
- [보강 모델 메타데이터](../models/teacher-rescnn-v1/metadata.json)

## 실행

README의 GPU Python 환경과 승인된 Native 엔진을 준비합니다. 아래 명령은 자료 수집, GPU 학습, 실험 가중치 내보내기를 순서대로 실행합니다. 출력은 새 폴더를 지정합니다.

```powershell
npm run train:teacher -- --out training/runs/my-teacher
```

기본값은 32판, 지도 엔진 30ms, 학습 20회입니다. `--games`, `--teacher-ms`, `--epochs`, `--checkpoint`로 바꿀 수 있습니다. 자료 수집 중 끊겼다면 같은 조건에 `--resume-data`를 붙여 이어갈 수 있습니다. 이미 수집한 자료는 새 학습 폴더와 `--dataset`으로 재사용합니다.

```powershell
npm run train:teacher -- --out training/runs/teacher-again --dataset reports/teacher-learning/dataset-v1 --epochs 5
```

단계를 개별 실행할 수도 있습니다.

```powershell
.venv-gpu\Scripts\python.exe training/teacher.py collect --out training/runs/teacher-data --games 32 --ms 30
.venv-gpu\Scripts\python.exe training/teacher.py fit --dataset training/runs/teacher-data --out training/runs/teacher-fit
.venv-gpu\Scripts\python.exe training/teacher.py export --run training/runs/teacher-fit --out training/runs/teacher-export
```

수집 재개는 동일한 코드·Native 바이너리·설정과 기존 기보 해시를 요구합니다. 학습에 연결한 완료 자료는 그대로 보관하고 새 수집은 새 폴더에서 수행합니다. 학습은 매 회차 가중치와 옵티마이저를 로컬에 저장합니다. 보강 학습의 `fit`은 새 학습을 시작하는 명령이며, 중단된 가중치를 `--checkpoint`로 지정하면 새 옵티마이저로 다시 시작합니다. 기존 MCTS 학습의 전체 상태 재개 기능과는 별개입니다.

이 변경은 기존 학습·리그의 소스 파일을 수정하지 않아 이전 체크포인트·보고서의 해시 연결을 유지합니다. 실전 모델 레지스트리는 변경하지 않습니다.

## 모델과 결과 재검증

저장소의 `models/teacher-rescnn-v1/experimental.pt`는 선택된 가중치입니다. 전체 학습 체크포인트는 로컬 `training/runs/teacher-v1/`에 있습니다.

```powershell
.venv-gpu\Scripts\python.exe training/verify_teacher.py --dataset reports/teacher-learning/dataset-v1 --report reports/teacher-learning/training-report.json --model models/teacher-rescnn-v1
```

실제 대전은 별도의 동일 시간 리그로 검사합니다.

```powershell
npm run neural:league -- --candidate models/teacher-rescnn-v1/experimental.pt --opponent models/experimental-rescnn/experimental.pt --out reports/neural-league/my-teacher-evaluation
```

기본 리그는 상대별 검증 20판과 통과 시 holdout 20판을 수행합니다. 후보를 바꾸며 같은 배치를 반복 확인한 결과는 별도의 새로운 미사용 시드 평가로 보완해야 합니다.

## 남은 추천 우선순위

1. 더 긴 시간의 지도 자료와 다양한 새 미로를 늘리고, 과적합을 줄여 가치·정책 성능 보강.
2. 충분히 개선된 후보의 기본 규모 리그와 새 미사용 시드 검증.
3. 통과한 신경망을 실전 GPU 추론·탐색에 연결하고 0.5초 지연 검증.
4. 외부 엔진·숙련자와 실제 실력 검증.
