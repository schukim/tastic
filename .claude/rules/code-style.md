# 코드 스타일 규칙

## 네이밍
- 컴포넌트: PascalCase (`ReviewCard.tsx`)
- 훅: camelCase (`useReview.ts`)
- 유틸리티: camelCase (`formatDate.ts`)
- 타입/인터페이스: PascalCase (`Review`, `ReviewProps`)
- DB 테이블: snake_case (`taste_profiles`)
- 상수: UPPER_SNAKE_CASE (`MAX_QUESTIONS`)

## TypeScript
- 모든 컴포넌트에 Props 인터페이스 정의
- `any` 사용 금지, 명시적 타입 사용
- Supabase 자동 생성 타입 활용 (`npm run db:types`)

## 파일 구조
- 한 파일에 하나의 주요 export
- 관련 컴포넌트는 같은 디렉토리에 배치
- index.ts 배럴 파일로 export 정리

## 스타일링
- NativeWind (Tailwind) className 사용
- inline style 최소화
- 테마 색상은 Tailwind config에서 관리
