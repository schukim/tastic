# CLAUDE.md

Tastic — 문화 콘텐츠(영화, 음악, 책, 미술, 전시, 공연) 감상 후 LLM 기반 인터뷰를 통해 개인 평론을 작성하고, 취향을 분석·추천하는 모바일 앱.

## Tech Stack

- **Frontend**: React Native (Expo) + TypeScript
- **State**: Zustand
- **Navigation**: React Navigation (bottom tabs + stack)
- **Backend**: Supabase (Auth, PostgreSQL, Edge Functions)
- **LLM**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Styling**: NativeWind (Tailwind for RN)
- **Testing**: Vitest (unit), Detox (e2e)
- **Language**: 한국어 기본, i18n 지원 (ko, en)

## Commands

```bash
npx expo start          # 개발 서버 시작
npx expo start --ios    # iOS 시뮬레이터
npx expo start --android # Android 에뮬레이터
npm run test            # Vitest 단위 테스트
npm run test:e2e        # Detox e2e 테스트
npm run lint            # ESLint + Prettier
npm run typecheck       # tsc --noEmit
npm run db:migrate      # Supabase 마이그레이션 적용
npm run db:types        # Supabase에서 TypeScript 타입 생성
```

## Project Structure

```
src/
  screens/          # 5개 탭 화면 + 서브 화면
  components/       # 재사용 UI 컴포넌트
  navigation/       # React Navigation 설정
  services/         # Supabase, Claude API 호출
  hooks/            # 커스텀 React 훅
  stores/           # Zustand 스토어
  types/            # TypeScript 타입 정의
  utils/            # 유틸리티 함수
  i18n/             # 다국어 리소스
  prompts/          # LLM 프롬프트 템플릿
supabase/
  migrations/       # DB 마이그레이션
  functions/        # Edge Functions (LLM 호출 프록시)
  seed.sql          # 시드 데이터
```

## Conventions

- 컴포넌트: PascalCase (`ReviewCard.tsx`), 훅: camelCase (`useReview.ts`)
- 모든 컴포넌트에 TypeScript Props 인터페이스 정의
- API 응답 형태: `{ data, error, status }`
- DB 테이블명 snake_case, TypeScript 타입 PascalCase
- LLM 프롬프트는 `src/prompts/` 에 분리하여 관리, 하드코딩 금지
- Supabase RLS(Row Level Security) 필수 적용
- 모든 비동기 호출 try/catch + 사용자 피드백

## 5 Tabs (Bottom Navigation)

| 순서 | 탭 | 아이콘 | 핵심 기능 |
|------|------|--------|-----------|
| 1 | 히스토리 | 📋 | 캘린더 + 리스트로 평론 기록 탐색 |
| 2 | 추천 | 💡 | 취향 기반 크로스 카테고리 콘텐츠 추천 |
| 3 | 평론(홈) | ✍️ | LLM 인터뷰 기반 평론 작성 (중앙, 메인) |
| 4 | 분석 | 📊 | 누적 평론 기반 정성적 취향 분석 |
| 5 | 마이 | 👤 | 프로필, 설정, 구독 |

## Reference Documents (화면 구현 시 반드시 참조)

### UX 워크플로우 — `docs/ux/`
**Read when:** 특정 탭이나 화면을 구현·수정할 때. 각 문서에 화면 상태, 전환 애니메이션, 인터랙션 상세가 정의되어 있음.
- `docs/ux/auth.md` — 로그인/회원가입
- `docs/ux/review-home.md` — 평론(홈) 탭 전체 플로우
- `docs/ux/history.md` — 히스토리 탭 (캘린더 + 리스트 + 팝업)
- `docs/ux/recommend.md` — 추천 탭
- `docs/ux/analysis.md` — 분석 탭
- `docs/ux/mypage.md` — 마이페이지

### 기능 명세 — `docs/feature-spec.md`
**Read when:** 기능 요구사항 확인이 필요할 때

### 아키텍처 — `docs/architecture.md`
**Read when:** 시스템 구성이나 데이터 흐름을 파악할 때

### LLM 프롬프트 전략 — `docs/prompt-strategy.md`
**Read when:** Edge Function 구현, LLM 호출 로직 작성, 프롬프트 템플릿 작업 시. 5개 Edge Function(verify-content, generate-question, generate-review, analyze-taste, recommend-content)의 입출력 스펙과 프롬프트 구조가 정의되어 있음.

### 오프라인/에러 처리 — `docs/error-handling.md`
**Read when:** 에러 상태 UI 구현, 네트워크 처리 로직 작성 시. 인터뷰 auto-draft, 저장 실패 복구, 타임아웃, 에러 메시지 톤 등이 정의되어 있음.

## Key Domain Rules

- 평론 작성 질문은 "보편적"이 아닌 해당 콘텐츠 **특화** 질문이어야 함
- 취향 분석은 정성적 서술(스토리 형태), 단순 통계/키워드 나열 금지
- 추천은 카테고리 경계를 넘을 수 있음 (영화 평론 → 책 추천 가능)
- 질문 5개 이상 답변 시 "평론 미리보기" 활성화
- 질문 전환 시 UX: 새끼질문=아래 스크롤, 주제전환=오른쪽 슬라이드