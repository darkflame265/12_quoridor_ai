# 외부 구성 요소와 프로젝트 기여

## SigmaQuoridor 기반 파일

원본 저장소: [bartolomeo3000/SigmaQuoridor](https://github.com/bartolomeo3000/SigmaQuoridor) · 저작자: Bartosz Pokora

`vendor/sigma-quoridor/game.py`, `mcts.py` 및 `models/best.onnx`는 외부 SigmaQuoridor 기반 구성입니다. 신경망 모델은 이 프로젝트에서 처음부터 학습한 결과물이 아닙니다.

동봉된 [LICENSE](../vendor/sigma-quoridor/LICENSE)는 MIT License이며 `Copyright (c) 2026 Bartosz Pokora`를 명시합니다. 원본 고지와 라이선스를 보존합니다. 별도 모델 권리나 학습 데이터의 출처까지 이 고지만으로 확정하지는 않습니다.

현재 기반 MCTS에는 시간 제한과 완료 탐색량 기록을 위한 변경이 들어갔습니다. Python 정책과 캐시·빠른 벽 판정은 프로젝트에서 확장한 부분입니다. 원본 기반을 모두 독자 구현한 것으로 소개하지 않습니다.

## 이 프로젝트에서 구현·통합한 범위

- 브라우저 보드와 이동·벽 미리보기, 기보·관전 UI
- 픽셀 기반 격자·말·벽·진영·차례 인식, Worker 처리
- 인식 배치를 합법 수열로 대조하고 누락 진행을 복원하는 동기화
- 로컬 Node HTTP 서비스와 Python 추론 프로토콜
- 협력적 취소, 최신 요청 우선 처리, 시간 제한 및 캐시
- 선택한 과거 이력에 맞춘 자동 기보 분석과 결과 재사용
- 실제 경로 변화와 검증한 상대 벽을 이용한 쉬운 추천 설명
- 모드 선택과 개인 세션 복원, UI·엔진 통합 검증
- 모델 입력·정책 매핑을 검증한 JavaScript PUCT와 브라우저 Worker 실행

## ONNX Runtime Web

브라우저 추론에 Microsoft의 `onnxruntime-web` 1.31.1을 사용합니다. [동봉 라이선스](../vendor/onnxruntime/LICENSE)는 MIT License입니다. npm 패키지에서 제공하는 WASM·JavaScript를 빌드에 포함하며, 원본 런타임을 직접 개발한 것으로 소개하지 않습니다. 모델과 런타임 라이선스 고지를 생성 자산에도 포함합니다.

브라우저판은 같은 모델의 입력·출력을 사용하지만 Python 엔진의 전체 전술 처리와 동일한 실력을 보장하지 않습니다. 과거 Python 대전 결과를 Web 버전의 승률로 제시하지 않습니다.

화면 공유 대상 게임은 별도 서비스입니다. 해당 서비스의 공식 제품이나 제휴 도구로 표현하지 않습니다.
