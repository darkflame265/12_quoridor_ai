# Quoridor AI Studio

Sigma 2·3·4를 사용하는 개인용 쿼리도 대전·분석 앱입니다.

## 실행

Node.js 22 이상과 Python이 필요합니다. 현재 확인한 환경은 Node24와 Python3.14입니다.

```powershell
npm ci
python -m pip install -r requirements.txt
npm run play
```

주소는 **http://127.0.0.1:12324/**로 고정됩니다. 바탕화면 `Quoridor AI` 바로가기도 같은 실행기를 사용합니다. 종료는 `npm run play:stop`, 바로가기 설치는 `npm run play:shortcuts`입니다. 정상 실행 중이면 기존 서버를 재사용하고, 종료된 프로세스의 잠금은 자동 정리합니다.

## 엔진

- **Sigma 2**: 보존된 기준 PUCT 추론 코드.
- **Sigma 3**: 공통 ONNX 모델과 추가 전술·경로 검토.
- **Sigma 4**: Sigma3 추론과 제한된 추가 전술 탐색.

세 엔진은 `vendor/sigma-quoridor/models/best.onnx`, 게임 규칙과 MCTS를 공유합니다. Sigma4가 Sigma3 공통 코드를 사용하므로 그 코드는 필수입니다. 현재 추론은 CPU의 ONNX Runtime을 사용합니다. GPU 가상환경이나 Rust 컴파일러는 앱 실행에 필요하지 않습니다. 정리 과정에서 모델·추론 알고리즘을 변경하지 않았으며, Sigma4의 전체 승률 우위를 뜻하지 않습니다.

예전 Sigma1·Atlas 기보의 수와 배치는 그대로 불러올 수 있습니다. 삭제된 엔진을 선택한 기록은 새 분석에 Sigma4를 사용하고 안내를 표시합니다. 기존 엔진으로 재계산하는 기능은 제공하지 않습니다.

## 화면 연결과 기보

`Wallz 연결`을 누르고 브라우저 공유 창에서 게임 탭을 고르면 보드·말·벽·진영·차례를 판독합니다. 정상 판독이면 자동 적용·감시를 시작하고, 불확실한 경우 보정 창을 엽니다. 공유 중인 `Wallz 연결` 또는 `현재 화면 재동기화`는 연결을 재사용합니다.

포지션 분석은 보드 위 고정 영역에 표시하며 상세 내용은 내부에서 스크롤됩니다. AI 대전·양쪽 직접 조작·관전과 JSON 기보 저장/불러오기를 지원합니다.

## 개발과 확인

```powershell
npm run dev          # Sigma 서비스와 Vite 개발 서버
npm run build        # 웹 빌드
npm test             # 게임 규칙·연동·세션 검사
npm run sigma:smoke  # 실제 세 Sigma 모델 추론 확인
npm run screen:qa    # 격리 브라우저의 화면 연결·재동기화·관전·기보 검사
```

`scripts`와 `evaluation`의 Sigma 연구 자료는 유지합니다. 배포 시 필수인 모델·벤더 라이선스는 삭제하지 마세요. `node_modules`와 `dist`는 재생성 가능하며, 실행 상태·짧은 작업 보존본은 `.local-app`에 있습니다. 과거 Rust 엔진, 학습 가상환경, 대용량 다운로드 및 Atlas 전용 개발 명령은 제거했습니다.
