# Tastic 시스템 아키텍처

## 전체 구조

```
┌─────────────────────────────────────────────┐
│              React Native (Expo)            │
│         TypeScript + NativeWind             │
├─────────────────────────────────────────────┤
│  Zustand Store  │  React Navigation         │
│  (상태 관리)     │  (Bottom Tabs + Stack)     │
└────────┬────────┴────────┬──────────────────┘
         │                 │
         ▼                 ▼
┌─────────────────────────────────────────────┐
│            Supabase Client SDK              │
│         (Auth, Database, Storage)           │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│              Supabase Backend               │
├──────────────┬──────────────┬───────────────┤
│  PostgreSQL  │  Auth        │  Edge         │
│  + RLS       │  (GoTrue)   │  Functions    │
└──────────────┴──────────────┴───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │  Anthropic    │
                              │  Claude API   │
                              │  (Sonnet)     │
                              └───────────────┘
```

## 계층별 상세

### 1. 프론트엔드 (React Native / Expo)

```
src/
├── screens/           # 화면 컴포넌트
│   ├── Review/        # 평론 작성 (홈)
│   ├── History/       # 히스토리
│   ├── Recommend/     # 추천
│   ├── Analysis/      # 분석
│   ├── My/            # 마이페이지
│   └── Auth/          # 인증 (로그인/회원가입)
├── components/        # 재사용 UI 컴포넌트
├── navigation/        # React Navigation 설정
├── services/          # API 호출 계층
│   ├── supabase.ts    # Supabase 클라이언트 초기화
│   ├── auth.ts        # 인증 서비스
│   ├── review.ts      # 평론 CRUD
│   └── claude.ts      # Claude API 호출 (Edge Function 경유)
├── hooks/             # 커스텀 훅
├── stores/            # Zustand 상태 관리
│   ├── authStore.ts   # 인증 상태
│   ├── reviewStore.ts # 평론 상태
│   └── settingsStore.ts # 설정 상태
├── types/             # TypeScript 타입
├── utils/             # 유틸리티
├── i18n/              # 다국어 (ko, en)
└── prompts/           # LLM 프롬프트 템플릿
```

### 2. 백엔드 (Supabase)

#### DB 스키마 (핵심 테이블)

- `users` — 사용자 프로필
- `contents` — 콘텐츠 메타데이터
- `reviews` — 평론 본문
- `interviews` — 인터뷰 대화 기록 (질문/답변)
- `taste_profiles` — 취향 분석 결과
- `recommendations` — 추천 기록
- `wishlists` — 위시리스트

#### Edge Functions

- `verify-content` — 작품 검색/식별 (Claude API, 외부 DB 없이 LLM 지식 기반)
- `generate-question` — 인터뷰 질문 생성 (Claude API)
- `generate-review` — 평론 생성 (Claude API)
- `analyze-taste` — 취향 분석 (Claude API)
- `recommend-content` — 콘텐츠 추천 (Claude API)

### 3. LLM 연동 (Claude API)

- 모든 LLM 호출은 Supabase Edge Functions를 통해 프록시
- API 키는 서버 측에서만 관리 (클라이언트 노출 금지)
- 모델: `claude-sonnet-4-20250514`
- 프롬프트 템플릿은 `src/prompts/`에서 관리

## 데이터 흐름

### 평론 작성 플로우

```
사용자 → 콘텐츠 정보 입력 (제목 + 카테고리)
       → Edge Function (verify-content) → Claude API → 작품 후보 반환
       → 사용자 작품 선택 (또는 직접 입력)
       → Edge Function (generate-question) → Claude API → 질문 반환
       → 사용자 답변
       → Edge Function (generate-question) → Claude API → 후속 질문
       → ... (반복, 5개 이상 답변 시 미리보기 가능)
       → Edge Function (generate-review) → Claude API → 평론 생성
       → 사용자 수정/저장 → PostgreSQL
```

## 보안

- Supabase RLS 필수 적용 (모든 테이블)
- Claude API 키는 Edge Function 환경변수로만 관리
- 사용자 데이터는 본인만 접근 가능
