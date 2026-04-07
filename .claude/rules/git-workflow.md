# Git 워크플로우

## 브랜치 전략
- `main` — 프로덕션 배포 브랜치
- `develop` — 개발 통합 브랜치
- `feature/<name>` — 기능 개발
- `fix/<name>` — 버그 수정

## 커밋 메시지
- 한국어 또는 영어 (프로젝트 내 통일)
- 형식: `<type>: <description>`
- type: feat, fix, refactor, style, docs, test, chore

## PR 규칙
- 하나의 기능/수정 단위로 PR 생성
- 리뷰 전 lint, typecheck, test 통과 확인
- 스크린샷 첨부 (UI 변경 시)
