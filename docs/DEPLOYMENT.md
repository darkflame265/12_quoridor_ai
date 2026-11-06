# GitHub Pages 배포

사이트 주소: https://darkflame265.github.io/12_quoridor_ai/

## 구성

- 공개 저장소 `darkflame265/12_quoridor_ai`
- 저장소 Settings → Pages → Source: GitHub Actions
- `.github/workflows/pages.yml`이 `main` push 또는 수동 실행 시 동작
- Ubuntu 표준 실행 환경에서 Node.js 24로 설치·테스트·브라우저 빌드
- `dist`만 Pages에 업로드. Python 서버와 연구 자료는 배포하지 않음
- 모델·WASM을 방문자 브라우저에서 실행. 초기 준비 시간은 탐색 예산과 별도

## 업데이트

변경을 `main`에 커밋·push하면 자동 배포됩니다. 추가 파일 업로드나 GitHub 설정 변경은 필요하지 않습니다. [배포 실행 내역](https://github.com/darkflame265/12_quoridor_ai/actions/workflows/pages.yml)에서 초록색 완료와 배포된 커밋을 확인할 수 있습니다.

수동 재배포는 Actions → GitHub Pages 배포 → Run workflow에서 실행합니다. 실패하면 해당 실행의 build/deploy 로그를 확인합니다.

## 로컬 확인

```sh
npm ci
npm test
npm run build -- --base=/12_quoridor_ai/
npm run preview
```

preview가 표시하는 주소 뒤에 `/12_quoridor_ai/`를 붙여 접속합니다. 이 로컬 명령은 원격 사이트에 배포하지 않습니다.

사이트 공개 여부는 저장소의 Pages 설정을 따릅니다. 공개 저장소의 표준 Actions 실행과 Pages는 무료 사용 대상이지만 사이트 크기·전송량 등 서비스 한도가 있습니다. 무제한 호스팅은 아닙니다.
