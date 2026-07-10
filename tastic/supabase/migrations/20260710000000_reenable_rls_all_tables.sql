-- ============================================================
-- RLS 재활성화 (개발용 비활성화 마이그레이션 무력화)
--
-- 00002_disable_rls_for_dev / 00003_disable_users_rls 는 개발 편의로
-- users·reviews·interviews·taste_profiles·recommendations 의 RLS를 껐다.
-- 리모트 프로덕션은 별도로 바로잡혀 있으나(현재 RLS ON), 이 마이그레이션
-- 체인을 새 환경(db reset / 신규 프로젝트)에 그대로 적용하면 위 테이블들이
-- RLS OFF 로 떠서 사용자 데이터가 노출·변조될 수 있다.
--
-- 이 마이그레이션은 앱 소유 테이블 전체에 RLS + 소유자 정책을 멱등하게
-- 재적용하여 그 위험을 제거한다. 이미 켜져 있는 리모트에는 no-op 에 가깝다.
-- (00002/00003 은 리모트 히스토리에 이미 적용돼 있어 삭제하지 않고 전진 수정한다.)
-- ============================================================

-- users
do $$ begin
  if to_regclass('public.users') is not null then
    alter table public.users enable row level security;
    drop policy if exists "Users can view own profile" on public.users;
    create policy "Users can view own profile"
      on public.users for select using (auth.uid() = id);
    drop policy if exists "Users can update own profile" on public.users;
    create policy "Users can update own profile"
      on public.users for update using (auth.uid() = id);
    drop policy if exists "Users can insert own profile" on public.users;
    create policy "Users can insert own profile"
      on public.users for insert with check (auth.uid() = id);
  end if;
end $$;

-- contents (있을 경우)
do $$ begin
  if to_regclass('public.contents') is not null then
    alter table public.contents enable row level security;
    drop policy if exists "Users can manage own contents" on public.contents;
    create policy "Users can manage own contents"
      on public.contents for all using (auth.uid() = user_id);
  end if;
end $$;

-- reviews
do $$ begin
  if to_regclass('public.reviews') is not null then
    alter table public.reviews enable row level security;
    drop policy if exists "Users can manage own reviews" on public.reviews;
    create policy "Users can manage own reviews"
      on public.reviews for all using (auth.uid() = user_id);
  end if;
end $$;

-- interviews
do $$ begin
  if to_regclass('public.interviews') is not null then
    alter table public.interviews enable row level security;
    drop policy if exists "Users can manage own interviews" on public.interviews;
    create policy "Users can manage own interviews"
      on public.interviews for all using (auth.uid() = user_id);
  end if;
end $$;

-- taste_profiles
do $$ begin
  if to_regclass('public.taste_profiles') is not null then
    alter table public.taste_profiles enable row level security;
    drop policy if exists "Users can manage own taste profiles" on public.taste_profiles;
    create policy "Users can manage own taste profiles"
      on public.taste_profiles for all using (auth.uid() = user_id);
  end if;
end $$;

-- recommendations
do $$ begin
  if to_regclass('public.recommendations') is not null then
    alter table public.recommendations enable row level security;
    drop policy if exists "Users can manage own recommendations" on public.recommendations;
    create policy "Users can manage own recommendations"
      on public.recommendations for all using (auth.uid() = user_id);
  end if;
end $$;
