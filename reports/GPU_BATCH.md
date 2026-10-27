# GPU 배치 자가대국 구축 및 실행 검증

2026-10-27. 이 변경은 **자가대국 데이터 생성과 학습 파이프라인**을 개선합니다. 실전 엔진은 검증된 Atlas 5.3을 유지하며 신경망을 기본 엔진으로 활성화하지 않았습니다.

## 적용 내용

- PUCT 탐색을 노드 확장 요청을 내보내는 공통 흐름으로 분리했습니다. 기존 직렬 탐색과 배치 탐색은 선택·백업·합법 행동 마스킹·즉시 승리 및 패배 방어를 공유합니다.
- 여러 독립 대국에서 확장할 노드를 모아 한 번의 PyTorch 추론으로 처리합니다. 중복 상태의 규칙·예측 결과를 재사용하고 캐시는 크기를 제한합니다. 기본 동시 대국은 16개, 추론 최대 배치는 64개입니다.
- CPU 작업자마다 별도의 Node/WASM 규칙 프로세스를 유지합니다. 기본 2개 프로세스가 합법 수·휴리스틱 사전 확률 계산을 나눠 수행합니다. GPU 모델은 메인 Python 프로세스에 하나만 둡니다.
- 대국별 난수 스트림을 사용합니다. 학습 입력 순서를 유지하기 위해 완료 결과는 게임 ID 순서로 전달합니다. 완료 대기 게임도 동시 대국 한도에 포함하므로 긴 게임이 앞에 있거나 마지막 게임들만 남으면 실제 배치가 작아질 수 있습니다.
- 각 완료 대국의 기보와 `x/pi/z` 배열을 바로 저장합니다. 배열은 float32이고 현재 차례 기준 292개 입력, 209개 행동 방문 분포, 승패 가치 목표입니다. 수 제한으로 끝난 미완료 대국은 기록만 남기고 학습 라벨을 만들지 않습니다.
- 모델·규칙·코드·설정 해시를 기록합니다. 재개할 때 이를 검사하고 기존 완료 파일을 해시로 검증합니다. 완료하지 못한 게임은 해당 게임의 난수 시드부터 다시 생성합니다. GPU 배치 모양이나 환경 변화에 따른 부동소수점 차이까지 비트 단위로 같다고 보장하지는 않습니다.
- JSON·NPZ 파일은 임시 파일에 기록한 뒤 원자적으로 교체합니다. Windows의 일시적인 파일 잠금은 제한된 횟수로 재시도하며 기존 파일을 먼저 삭제하지 않습니다. 초기에 실제 잠금 오류가 발생해 이를 보완했고, 해당 초기 시도는 최종 데이터에 포함하지 않았습니다. [초기 저장 오류 기록](gpu-batch/attempt1-storage-failure.json).
- 기존 학습기는 배치 자가대국을 직접 실행하거나, 검증된 완료 데이터 폴더를 가져와 학습할 수 있습니다. 학습 리그의 기존 승격 조건과 실전 엔진의 승격 조건은 유지합니다.

## 처리량 측정

이 PC의 RTX 3060 Ti, PyTorch 2.11.0+cu128에서 같은 체크포인트·16대국·대국별 시드·12회 시뮬레이션·120수 제한으로 비교했습니다. 순서를 직렬→배치, 배치→직렬로 바꿔 두 번씩 실행했습니다.

| 설정 | 두 실행의 총 시간 | 총 진행 수 | 초당 진행 수 | 신경망 호출 |
|---|---:|---:|---:|---:|
| 직렬: 동시 대국 1, 규칙 작업자 1, 추론 배치 1 | 11.407초 | 1,324 | 116.1 | 7,882 |
| 배치: 동시 대국 16, 규칙 작업자 2, 최대 추론 배치 64 | 6.171초 | 1,324 | 214.5 | 1,942 |

처리량은 이 표본에서 **약 1.85배**였습니다. 네 실행의 전체 기보가 같았습니다. 실제 평균 추론 배치는 약 4.06개이며 최대치 64개를 항상 채우는 방식은 아닙니다. GPU 배치와 CPU 규칙 병렬화의 합산 개선이므로 GPU 커널만의 속도 향상으로 해석하면 안 됩니다.

시간에는 규칙 프로세스 시작·추론 워밍업·탐색·기보 검사가 포함됩니다. 한 번 로드한 모델을 사용하므로 Python 시작과 체크포인트/CUDA 모델 로딩 시간은 제외합니다. 직렬 비교군도 같은 새 스케줄러와 캐시를 쓰며, 기존 `train.py` 전체 실행 시간과 직접 비교한 수치는 아닙니다. 작은 MLP·한 PC에서의 결과이며 더 큰 모델과 대국 수에서는 별도 측정이 필요합니다.

[최종 측정 원자료](gpu-batch/benchmark-final.json). 저장 재시도 보완 전의 [첫 측정](gpu-batch/benchmark.json)도 보존했습니다.

## 실제 CUDA 데이터·재개·학습

- 32대국, 동시 16개, 규칙 작업자 2개, 24회 시뮬레이션, 200수 제한으로 생성했습니다. 8판에서 멈춘 뒤 `--resume`으로 나머지 24판을 완료했습니다.
- 결과는 목표선 도착 30판, 반복 무승부 2판, 학습 샘플 **1,208개**입니다. 이전 8판의 기보·배열 파일 해시는 재개 전후에 같았습니다. [재개 확인](gpu-batch/resume-check.json), [중간 manifest](gpu-batch/resume-partial-manifest.json).
- [작은 검증용 전체 데이터](gpu-batch/dataset-smoke/manifest.json)를 기보·압축 배열과 함께 보관했습니다. 총 65개 파일, 약 181KB입니다. 일반 대규모 실행과 체크포인트는 계속 `training/runs/`에 두고 Git에서 제외합니다.
- 완료 데이터는 독립 JS 규칙으로 다시 재생하고, 기보에서 입력·합법 정책 지원·승패 라벨을 재검사한 뒤 학습기에 가져옵니다.
- 생성한 데이터를 가져와 CUDA 역전파·옵티마이저 갱신·체크포인트·리그 대전까지 완료했습니다. 기존 리플레이 512개에 새 1,208개를 더해 1,720개로 학습했습니다. [가져오기 학습 기록](gpu-batch/training-import.json).
- 학습기 안에서 배치 자가대국 4판을 직접 생성하는 경로도 실행했습니다. 새 228개와 기존 512개, 총 740개로 CUDA 학습을 완료했습니다. [통합 학습 기록](gpu-batch/training-integrated.json).

두 짧은 학습 모두 Atlas 4 WASM 상대 소규모 대전은 0승 2패였고 승격하지 않았습니다. 학습 대전의 기준 상대는 아직 Atlas 4이며 실전 Atlas 5.3 상대 검증은 후속 작업입니다. 이는 GPU 파이프라인 확인이지 충분한 학습이나 강해진 신경망의 증명이 아닙니다. `models/registry.json`의 활성 신경망은 그대로 `null`입니다.

Python 테스트 11개는 CUDA 환경에서 통과했습니다. CPU 환경에서는 CUDA 전용 1개를 제외한 테스트를 실행합니다. 테스트에는 배치·직렬 탐색 일치, 작은 캐시에서 요청 순서 유지, 동시 수 변경 시 게임 난수 분리, GPU·CPU 추론 대조, 파일 잠금 재시도, 재개와 손상 데이터 거부, 미완료 대국 라벨 제외가 포함됩니다. 규칙 작업자 프로세스도 종료 후 남지 않는지 확인했습니다.

## 실행

프로젝트 루트에서 GPU 환경을 준비합니다. 이 PC에는 이미 설치되어 있습니다.

```powershell
python -m venv .venv-gpu
& .\.venv-gpu\Scripts\python.exe -m pip install -r training/requirements-gpu.txt
npm run selfplay:gpu -- --out training/runs/my-gpu-batch --games 32 --simulations 24
```

기존 폴더를 덮어쓰지 않습니다. GPU 실행은 CUDA가 없으면 오류를 내며 CPU를 원하면 `npm run selfplay:cpu -- ...`를 사용합니다.

나누어 생성하고 재개하는 예입니다. 모델·규칙·코드와 대국 설정은 같아야 하며 `--max-new-games`는 실행 분량만 제한하므로 바꿀 수 있습니다.

```powershell
npm run selfplay:gpu -- --out training/runs/chunked-batch --games 32 --simulations 24 --max-new-games 8
npm run selfplay:gpu -- --out training/runs/chunked-batch --games 32 --simulations 24 --resume
```

배치 생성과 학습을 연결하는 짧은 실행 예입니다. 이 설정은 승격을 위한 충분한 대국 수가 아닙니다.

```powershell
& .\.venv-gpu\Scripts\python.exe training/train.py --resume models/bootstrap-checkpoint.pt --out training/runs/batched-training --selfplay-backend batched --games 4 --parallel-games 4 --rules-workers 2 --inference-batch 16 --simulations 8 --max-plies 120 --epochs 1 --arena-pairs 1 --arena-ms 20
& .\.venv-gpu\Scripts\python.exe training/train.py --resume models/bootstrap-checkpoint.pt --out training/runs/imported-training --replay-dir reports/gpu-batch/dataset-smoke --games 0 --simulations 8 --max-plies 120 --epochs 1 --arena-pairs 1 --arena-ms 20
```

완료되지 않은 데이터는 학습기로 가져올 수 없습니다. 변경된 모델·규칙·코드로 다시 생성할 때는 새 폴더를 사용합니다. `--parallel-games`, `--rules-workers`, `--inference-batch`로 동시성을 조절할 수 있으며 현재 학습 입력·모델은 기존 128폭 MLP입니다.

## 남은 추천 순서

1. 보드 구조를 반영하는 정책·가치 신경망과 MCTS를 본격 학습합니다.
2. 실전 Atlas 5.3과 과거 모델을 상대하는 리그·검증·자동 승격을 연결합니다.
3. 대규모 자가대국과 더 넓은 미로·회귀 평가로 학습량과 검증 표본을 늘립니다.
4. 강도가 검증된 신경망의 실전 추론을 연결하고 0.5초 응답 예산에서 비교합니다.
5. 독립 엔진·숙련자와 대전해 외부 실력을 검증합니다.
