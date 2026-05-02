-- ============================================================
-- 앱 스키마 정렬 마이그레이션
-- works(ingestion) 테이블은 유지하고,
-- 앱이 사용하는 contents 테이블을 생성하며
-- reviews/interviews의 FK를 content_id로 전환
-- ============================================================

-- 1. contents 테이블 생성
create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete cascade not null,
  title text not null,
  original_title text,
  category text not null check (category in ('movie','music','book','art','exhibition','performance')),
  creator text,
  year int,
  genre text,
  metadata jsonb default '{}',
  created_at timestamptz default now() not null
);

-- 2. reviews: work_id → content_id 전환
--    (기존 work_id 참조 데이터가 있을 경우 null 처리)
alter table public.reviews
  add column if not exists content_id uuid references public.contents on delete cascade;

-- work_id 컬럼 제거 (FK 제약조건 포함)
alter table public.reviews
  drop column if exists work_id;

-- content_id NOT NULL 적용
alter table public.reviews
  alter column content_id set not null;

-- 3. interviews: work_id → content_id 전환
alter table public.interviews
  add column if not exists content_id uuid references public.contents on delete cascade;

alter table public.interviews
  drop column if exists work_id;

alter table public.interviews
  alter column content_id set not null;

-- 4. 인덱스
create index if not exists idx_contents_user_id on public.contents (user_id);
create index if not exists idx_reviews_content_id on public.reviews (content_id);
create index if not exists idx_interviews_content_id on public.interviews (content_id);

-- 5. RLS
alter table public.contents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'contents' and policyname = 'Users can manage own contents'
  ) then
    create policy "Users can manage own contents"
      on public.contents for all using (auth.uid() = user_id);
  end if;
end $$;
