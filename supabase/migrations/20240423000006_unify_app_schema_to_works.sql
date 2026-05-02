-- 앱 본체 스키마를 works 카탈로그 위로 통합 (멱등 버전)
--
-- 목적
--   1) works.user_id NULLABLE
--   2) 앱 본체 5테이블 보장 (없으면 생성, 있으면 컬럼/제약 보강)
--   3) reviews/interviews는 work_id로 works(id) 참조 (구 content_id 제거)
--   4) 트리거 + RLS 정책 보장
--   5) 구 contents 테이블 DROP
-- 전제: 데이터 없음. 구 contents/content_id 컬럼은 폐기 가능.

BEGIN;

-- 0. 잔존 row 모두 폐기 (옵션 1: 데이터 없음 가정)
--    DO 블록 + EXECUTE로 감싸 테이블이 아직 없는 신규 환경에서도 안전하게 실행
DO $$ BEGIN
  EXECUTE 'TRUNCATE TABLE
    interviews, reviews, recommendations, taste_profiles, users
    RESTART IDENTITY CASCADE';
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- 1. works.user_id NULLABLE
ALTER TABLE works ALTER COLUMN user_id DROP NOT NULL;
COMMENT ON COLUMN works.user_id IS '사용자 등록 시 auth.uid(). 외부 ingestion으로 적재한 work는 NULL';

-- 2. users 테이블 보장
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  preferred_categories TEXT[] DEFAULT '{}',
  language TEXT DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. reviews 테이블 보장 + work_id 컬럼/FK 보강
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  work_id UUID,
  title TEXT,
  body TEXT NOT NULL,
  experience_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 데이터 없음 가정 — 구 컬럼 제거 후 신 컬럼 보장
ALTER TABLE reviews DROP COLUMN IF EXISTS content_id;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS work_id UUID;

-- FK 재설정
DO $$ BEGIN
  ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_user_id_fkey;
  ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_work_id_fkey;
  ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_content_id_fkey;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_work_id_fkey
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE;

-- 데이터 없으니 NOT NULL 강제
ALTER TABLE reviews ALTER COLUMN work_id SET NOT NULL;

-- 4. interviews 테이블 보장 + work_id 컬럼/FK 보강
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID,
  user_id UUID NOT NULL,
  work_id UUID,
  conversation JSONB NOT NULL DEFAULT '[]',
  question_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interviews DROP COLUMN IF EXISTS content_id;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS work_id UUID;

DO $$ BEGIN
  ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_user_id_fkey;
  ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_work_id_fkey;
  ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_content_id_fkey;
  ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_review_id_fkey;
  ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_work_id_fkey
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_review_id_fkey
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('in_progress', 'completed', 'abandoned'));

ALTER TABLE interviews ALTER COLUMN work_id SET NOT NULL;

-- 5. taste_profiles 보장
CREATE TABLE IF NOT EXISTS taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_sentences TEXT[] NOT NULL,
  recommendation_hook TEXT,
  review_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE taste_profiles DROP CONSTRAINT IF EXISTS taste_profiles_user_id_fkey;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE taste_profiles
  ADD CONSTRAINT taste_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6. recommendations 보장
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt TEXT,
  results JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_user_id_fkey;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE recommendations
  ADD CONSTRAINT recommendations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 7. 인덱스 (work_id 컬럼이 보장된 후에만 생성)
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_work_id ON reviews (work_id);
CREATE INDEX IF NOT EXISTS idx_reviews_experience_date ON reviews (experience_date);
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews (user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_work_id ON interviews (work_id);
CREATE INDEX IF NOT EXISTS idx_taste_profiles_user_id ON taste_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations (user_id);

-- 구 인덱스 정리
DROP INDEX IF EXISTS idx_reviews_content_id;
DROP INDEX IF EXISTS idx_interviews_content_id;

-- 8. updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_reviews_updated_at ON reviews;
CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS set_interviews_updated_at ON interviews;
CREATE TRIGGER set_interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 9. 신규 가입 시 public.users 프로필 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, nickname)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nickname', 'User'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 10. RLS 활성화 + 정책
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can manage own reviews" ON reviews;
CREATE POLICY "Users can manage own reviews" ON reviews
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own interviews" ON interviews;
CREATE POLICY "Users can manage own interviews" ON interviews
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own taste profiles" ON taste_profiles;
CREATE POLICY "Users can manage own taste profiles" ON taste_profiles
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own recommendations" ON recommendations;
CREATE POLICY "Users can manage own recommendations" ON recommendations
  FOR ALL USING (auth.uid() = user_id);

-- 11. normalize_title 함수 복구 (이전 클라우드 드리프트 보정)
CREATE OR REPLACE FUNCTION normalize_title(title TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(title, '^(the|a|an)\s+', '', 'i'),
          '[의|을|를|이|가|은|는|으로|로]$', '', 'g'
        ),
        '[^a-zA-Z0-9가-힣\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 12. 구 contents 테이블 DROP
DROP TABLE IF EXISTS contents CASCADE;

-- 13. 코멘트
COMMENT ON TABLE users IS '사용자 프로필 (auth.users 1:1)';
COMMENT ON TABLE reviews IS '평론 본문 - works(id) 참조';
COMMENT ON TABLE interviews IS 'LLM 인터뷰 대화 로그 - works(id) 참조';
COMMENT ON TABLE taste_profiles IS '취향 분석 결과';
COMMENT ON TABLE recommendations IS '추천 결과 캐시';

COMMIT;
