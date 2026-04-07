# Supabase DB 스키마

데이터베이스 스키마 관련 코드를 다룰 때 자동으로 적용되는 스킬입니다.

## 트리거 조건

- `supabase/migrations/` 파일 수정 시
- `src/types/database*` 파일 수정 시

## 규칙

### 테이블 규칙
- 테이블명 snake_case
- 모든 테이블에 `id` (uuid, PK), `created_at`, `updated_at` 컬럼 포함
- `user_id` 외래키로 사용자 소유권 설정
- soft delete 패턴 사용 시 `deleted_at` 컬럼

### RLS (Row Level Security)
- 모든 테이블에 RLS 필수 적용
- 기본 정책: 사용자 본인 데이터만 CRUD 가능
- `auth.uid() = user_id` 조건 사용

### 마이그레이션
- 파일명: `YYYYMMDDHHMMSS_description.sql`
- 롤백 가능한 마이그레이션 작성
- 인덱스는 자주 조회되는 컬럼에 설정
- 마이그레이션 적용 후 `npm run db:types`로 타입 재생성
