-- 개발용: 모든 외래키 제약조건 비활성화
-- Mock 사용자와 데이터 생성을 위해 필요

-- contents 테이블 외래키 제거
ALTER TABLE public.contents DROP CONSTRAINT IF EXISTS contents_user_id_fkey;

-- reviews 테이블 외래키 제거
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_user_id_fkey;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_content_id_fkey;

-- interviews 테이블 외래키 제거
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_user_id_fkey;
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_content_id_fkey;
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_review_id_fkey;

-- taste_profiles 테이블 외래키 제거
ALTER TABLE public.taste_profiles DROP CONSTRAINT IF EXISTS taste_profiles_user_id_fkey;

-- recommendations 테이블 외래키 제거
ALTER TABLE public.recommendations DROP CONSTRAINT IF EXISTS recommendations_user_id_fkey;

-- users 테이블 외래키 제거 (auth.users 참조)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;