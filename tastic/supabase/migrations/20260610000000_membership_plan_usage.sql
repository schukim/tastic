-- ============================================================
-- 멤버십 플랜 + 사용량 추적
-- - users.plan: free | membership
-- - usage_logs: 플랜 제한 검증용 사용 기록
--   (insert는 Edge Function의 service role만 수행, 클라이언트는 조회만)
-- ============================================================

-- 1. users.plan 컬럼
alter table public.users
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'membership'));

-- 2. usage_logs 테이블
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete cascade not null,
  action text not null check (action in ('review', 'analysis', 'recommendation')),
  -- 같은 인터뷰의 평론 재생성을 중복 카운트하지 않기 위한 참조 (예: interview id)
  ref_id uuid,
  created_at timestamptz default now() not null
);

create index if not exists idx_usage_logs_user_action_created
  on public.usage_logs (user_id, action, created_at desc);

-- 동일 ref에 대한 사용 기록은 1건만 (재생성 멱등 처리)
create unique index if not exists idx_usage_logs_user_action_ref
  on public.usage_logs (user_id, action, ref_id)
  where ref_id is not null;

-- 3. RLS — 본인 기록 조회만 허용, 쓰기는 service role 전용
alter table public.usage_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'usage_logs' and policyname = 'Users can view own usage logs'
  ) then
    create policy "Users can view own usage logs"
      on public.usage_logs for select using (auth.uid() = user_id);
  end if;
end $$;
