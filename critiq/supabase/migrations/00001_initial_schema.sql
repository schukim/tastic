-- ============================================
-- Critiq 초기 스키마
-- ============================================

-- users (Supabase Auth 연동)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  nickname text not null,
  avatar_url text,
  preferred_categories text[] default '{}',
  language text default 'ko' check (language in ('ko', 'en')),
  created_at timestamptz default now() not null
);

-- contents (작품 메타데이터)
create table public.contents (
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

-- reviews (평론)
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete cascade not null,
  content_id uuid references public.contents on delete cascade not null,
  title text,
  body text not null,
  experience_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- interviews (인터뷰 대화 기록)
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references public.reviews on delete set null,
  user_id uuid references public.users on delete cascade not null,
  content_id uuid references public.contents on delete cascade not null,
  conversation jsonb not null default '[]',
  question_count int default 0 not null,
  status text default 'in_progress' not null check (status in ('in_progress','completed','abandoned')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- taste_profiles (취향 분석)
create table public.taste_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete cascade not null,
  profile_sentences text[] not null,
  recommendation_hook text,
  review_count int not null default 0,
  created_at timestamptz default now() not null
);

-- recommendations (추천 기록)
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users on delete cascade not null,
  prompt text,
  results jsonb not null default '[]',
  created_at timestamptz default now() not null
);

-- ============================================
-- 인덱스
-- ============================================
create index idx_contents_user_id on public.contents (user_id);
create index idx_reviews_user_id on public.reviews (user_id);
create index idx_reviews_content_id on public.reviews (content_id);
create index idx_reviews_experience_date on public.reviews (experience_date);
create index idx_interviews_user_id on public.interviews (user_id);
create index idx_taste_profiles_user_id on public.taste_profiles (user_id);
create index idx_recommendations_user_id on public.recommendations (user_id);

-- ============================================
-- Row Level Security
-- ============================================
alter table public.users enable row level security;
alter table public.contents enable row level security;
alter table public.reviews enable row level security;
alter table public.interviews enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.recommendations enable row level security;

-- users: 본인 데이터만 접근
create policy "Users can view own profile"
  on public.users for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.users for insert with check (auth.uid() = id);

-- contents: 본인 데이터만 접근
create policy "Users can manage own contents"
  on public.contents for all using (auth.uid() = user_id);

-- reviews: 본인 데이터만 접근
create policy "Users can manage own reviews"
  on public.reviews for all using (auth.uid() = user_id);

-- interviews: 본인 데이터만 접근
create policy "Users can manage own interviews"
  on public.interviews for all using (auth.uid() = user_id);

-- taste_profiles: 본인 데이터만 접근
create policy "Users can manage own taste profiles"
  on public.taste_profiles for all using (auth.uid() = user_id);

-- recommendations: 본인 데이터만 접근
create policy "Users can manage own recommendations"
  on public.recommendations for all using (auth.uid() = user_id);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_reviews_updated_at
  before update on public.reviews
  for each row execute function public.handle_updated_at();

create trigger set_interviews_updated_at
  before update on public.interviews
  for each row execute function public.handle_updated_at();

-- ============================================
-- 신규 가입 시 users 프로필 자동 생성 트리거
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'User'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
