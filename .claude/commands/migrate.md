# /migrate — DB 마이그레이션 생성

Supabase PostgreSQL 마이그레이션 파일을 생성합니다.

## 사용법

```
/migrate <migration-name>
```

## 실행 내용

1. `supabase/migrations/` 에 타임스탬프 기반 마이그레이션 파일 생성
2. CREATE TABLE / ALTER TABLE SQL 작성
3. RLS (Row Level Security) 정책 포함
4. 인덱스 설정
5. TypeScript 타입 업데이트 안내 (`npm run db:types`)

## 생성 규칙

- 테이블명 snake_case
- 모든 테이블에 `id`, `created_at`, `updated_at` 컬럼 포함
- `user_id` 외래키로 사용자 소유권 설정
- RLS 정책 필수 (사용자 본인 데이터만 접근)
- 파일명: `YYYYMMDDHHMMSS_<migration-name>.sql`
