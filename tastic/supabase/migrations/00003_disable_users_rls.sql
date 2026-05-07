-- 개발용: users 테이블의 RLS도 비활성화
-- Mock 사용자 생성을 위해 필요

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;