# 테스트 규칙

## 단위 테스트 (Vitest)
- 유틸리티 함수, 커스텀 훅, 스토어 로직에 대해 작성
- 테스트 파일: `__tests__/<filename>.test.ts`
- `npm run test`로 실행

## E2E 테스트 (Detox)
- 주요 사용자 플로우에 대해 작성
- 평론 작성 플로우, 인증 플로우 등
- `npm run test:e2e`로 실행

## 테스트 원칙
- 구현 세부사항이 아닌 동작(behavior)을 테스트
- 외부 API (Claude, Supabase)는 mock 처리
- 비동기 로직 테스트 시 적절한 대기 처리
