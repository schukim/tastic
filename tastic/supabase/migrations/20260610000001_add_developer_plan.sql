-- ============================================================
-- developer 플랜 추가 (free / membership / developer)
-- developer는 DB에서 직접 부여하는 내부용 플랜 — UI에 노출하지 않음
-- ============================================================

alter table public.users drop constraint if exists users_plan_check;

alter table public.users
  add constraint users_plan_check
  check (plan in ('free', 'membership', 'developer'));
