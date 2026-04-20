-- 개발용: RLS 일시적으로 비활성화
-- 프로덕션에서는 이 마이그레이션을 제거하고 proper auth를 구현해야 함

-- RLS 비활성화
ALTER TABLE public.contents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.taste_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations DISABLE ROW LEVEL SECURITY;

-- users 테이블은 유지 (기본 사용자 데이터 보호)
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;