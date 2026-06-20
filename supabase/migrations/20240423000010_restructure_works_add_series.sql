-- works 테이블 재구성 + series 카테고리 추가
--
-- 변경사항:
--   1. work_category enum에 'series' 추가
--   2. works에 creator/year/genre/original_title 컬럼 추가 (metadata JSONB에서 승격)
--   3. 기존 metadata 데이터를 신규 컬럼으로 마이그레이션
--   4. exhibition/performance 제거 후 남은 dead columns (venue/start_date/end_date) 삭제
--   5. works updated_at 트리거 전면 교체 (title 변경 외에도 작동하도록)
--   6. works RLS 추가
--   7. search_works 재작성 (series 지원, creator 컬럼 활용, venue 매칭 제거)
--   8. find_potential_duplicates 재작성 (venue → creator 기반)
--   9. taste_profiles에 updated_at 추가

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. work_category 의존 객체 전부 제거 (enum recreate 전제)
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS works_by_source_stats;
DROP FUNCTION IF EXISTS get_works_stats();
DROP FUNCTION IF EXISTS find_potential_duplicates(text, work_category, text, date, double precision);
DROP FUNCTION IF EXISTS search_works(text, work_category, vector, double precision, double precision, integer);

-- ─────────────────────────────────────────────────────────────
-- 2. work_category enum 재생성 (series 추가)
-- ─────────────────────────────────────────────────────────────
ALTER TYPE work_category RENAME TO work_category_old;
CREATE TYPE work_category AS ENUM ('movie', 'music', 'book', 'art', 'series');

ALTER TABLE works
  ALTER COLUMN category TYPE work_category
    USING category::text::work_category;

DROP TYPE work_category_old;

-- ─────────────────────────────────────────────────────────────
-- 3. works에 신규 컬럼 추가
-- ─────────────────────────────────────────────────────────────
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS original_title TEXT,
  ADD COLUMN IF NOT EXISTS creator TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS genre TEXT;

-- ─────────────────────────────────────────────────────────────
-- 4. 기존 metadata → 컬럼 데이터 마이그레이션
-- ─────────────────────────────────────────────────────────────
UPDATE works SET
  original_title = NULLIF(TRIM(metadata->>'original_title'), ''),
  creator        = NULLIF(TRIM(metadata->>'creator'), ''),
  year           = CASE
                     WHEN (metadata->>'year') ~ '^[0-9]{4}$'
                     THEN (metadata->>'year')::integer
                     ELSE NULL
                   END,
  genre          = NULLIF(TRIM(metadata->>'genre'), '')
WHERE metadata IS NOT NULL AND metadata != '{}';

-- ─────────────────────────────────────────────────────────────
-- 5. Dead columns 제거 (exhibition/performance 제거 후 잔재)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE works
  DROP COLUMN IF EXISTS venue,
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS end_date;

-- ─────────────────────────────────────────────────────────────
-- 6. works updated_at 트리거 재작성
--    구 트리거: title 변경 시에만 updated_at 갱신 (부족)
--    신 트리거: INSERT/UPDATE 전체에 대해 title_normalized + updated_at 갱신
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_update_title_normalized ON works;
DROP TRIGGER IF EXISTS trigger_works_updated ON works;
DROP FUNCTION IF EXISTS update_title_normalized();
DROP FUNCTION IF EXISTS handle_works_before_upsert();

CREATE OR REPLACE FUNCTION handle_works_before_upsert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.title_normalized := normalize_title(NEW.title);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_works_updated
  BEFORE INSERT OR UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION handle_works_before_upsert();

-- ─────────────────────────────────────────────────────────────
-- 7. taste_profiles에 updated_at 추가
-- ─────────────────────────────────────────────────────────────
ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS set_taste_profiles_updated_at ON taste_profiles;
CREATE TRIGGER set_taste_profiles_updated_at
  BEFORE UPDATE ON taste_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8. works RLS 추가
--    - 인증 사용자: verified works 전체 읽기 + 본인 works 읽기
--    - 본인 works만 생성/수정 가능
--    - ingestion(service_role)은 RLS 우회
-- ─────────────────────────────────────────────────────────────
ALTER TABLE works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read works" ON works;
CREATE POLICY "Users can read works" ON works
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (is_verified = true OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own works" ON works;
CREATE POLICY "Users can insert own works" ON works
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own works" ON works;
CREATE POLICY "Users can update own works" ON works
  FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 9. search_works 재작성
--    - creator 컬럼 반환 (JSONB 대신 컬럼)
--    - venue 매칭 브랜치 제거
--    - 모든 카테고리에 통일된 creator 유사도 보정 적용
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_works(
  query_text text,
  target_category work_category DEFAULT NULL,
  query_embedding vector DEFAULT NULL,
  trigram_weight double precision DEFAULT 0.4,
  embedding_weight double precision DEFAULT 0.6,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  category work_category,
  original_title text,
  creator text,
  year integer,
  genre text,
  metadata jsonb,
  primary_source character varying,
  external_ids jsonb,
  is_verified boolean,
  similarity_score double precision,
  trigram_score double precision,
  embedding_score double precision,
  match_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_query TEXT;
  trigram_threshold FLOAT := 0.2;
BEGIN
  IF query_text IS NULL OR trim(query_text) = '' THEN
    RAISE EXCEPTION 'query_text cannot be null or empty';
  END IF;

  normalized_query := normalize_title(query_text);

  RETURN QUERY
  WITH
  external_id_match_flag AS (
    SELECT w.id AS work_id
    FROM works w
    WHERE (target_category IS NULL OR w.category = target_category)
      AND (
        (w.external_ids ? 'tmdb'        AND w.external_ids->>'tmdb'        = query_text) OR
        (w.external_ids ? 'imdb'        AND w.external_ids->>'imdb'        = query_text) OR
        (w.external_ids ? 'musicbrainz' AND w.external_ids->>'musicbrainz' = query_text) OR
        (w.external_ids ? 'isbn'        AND w.external_ids->>'isbn'        = query_text) OR
        (w.external_ids ? 'kopis'       AND w.external_ids->>'kopis'       = query_text) OR
        (w.external_ids ? 'openlibrary' AND w.external_ids->>'openlibrary' = query_text)
      )
  ),
  candidates AS (
    -- 1. External ID 완전일치 (최우선)
    SELECT
      w.id, w.title, w.category, w.original_title, w.creator, w.year, w.genre,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      1.0::FLOAT AS similarity_score,
      1.0::FLOAT AS trigram_score,
      1.0::FLOAT AS embedding_score,
      'external_id_match'::TEXT AS match_reason
    FROM works w
    INNER JOIN external_id_match_flag em ON w.id = em.work_id

    UNION ALL

    -- 2. 제목 + creator 하이브리드 유사도 검색
    SELECT
      w.id, w.title, w.category, w.original_title, w.creator, w.year, w.genre,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      LEAST(1.0, (
        COALESCE(similarity(w.title_normalized, normalized_query), 0)::FLOAT * trigram_weight
        +
        CASE
          WHEN query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL
          THEN (1 - (w.title_embedding <=> query_embedding))::FLOAT * embedding_weight
          ELSE 0.0
        END
        +
        CASE
          WHEN w.creator IS NOT NULL
            AND w.creator ILIKE '%' || split_part(query_text, ' ', 1) || '%'
          THEN 0.15
          ELSE 0.0
        END
      ))::FLOAT AS similarity_score,
      COALESCE(similarity(w.title_normalized, normalized_query), 0)::FLOAT AS trigram_score,
      CASE
        WHEN query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL
        THEN (1 - (w.title_embedding <=> query_embedding))::FLOAT
        ELSE 0.0
      END AS embedding_score,
      'similarity_match'::TEXT AS match_reason
    FROM works w
    LEFT JOIN external_id_match_flag em ON w.id = em.work_id
    WHERE (target_category IS NULL OR w.category = target_category)
      AND em.work_id IS NULL
      AND (
        w.title_normalized % normalized_query
        OR similarity(w.title_normalized, normalized_query) > trigram_threshold
        OR (query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL)
      )
  )
  SELECT * FROM candidates
  WHERE candidates.similarity_score > 0
  ORDER BY
    candidates.similarity_score DESC,
    candidates.is_verified DESC,
    candidates.title
  LIMIT limit_count;
END;
$$;

REVOKE ALL ON FUNCTION search_works FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_works TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 10. find_potential_duplicates 재작성
--     venue/start_date 파라미터 → creator 파라미터로 교체
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_potential_duplicates(
  check_title text,
  check_category work_category,
  check_creator text DEFAULT NULL,
  threshold double precision DEFAULT 0.75
)
RETURNS TABLE (
  id uuid,
  title text,
  creator text,
  similarity_score double precision,
  match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_check_title TEXT;
BEGIN
  normalized_check_title := normalize_title(check_title);

  RETURN QUERY
  SELECT
    w.id,
    w.title,
    w.creator,
    similarity(w.title_normalized, normalized_check_title)::FLOAT AS similarity_score,
    'title_similarity'::TEXT AS match_type
  FROM works w
  WHERE w.category = check_category
    AND similarity(w.title_normalized, normalized_check_title) > threshold
    AND (check_creator IS NULL OR w.creator ILIKE '%' || check_creator || '%')
  ORDER BY similarity_score DESC;
END;
$$;

REVOKE ALL ON FUNCTION find_potential_duplicates FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_potential_duplicates TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 11. get_works_stats + works_by_source_stats 재생성
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_works_stats()
RETURNS TABLE (
  source character varying,
  category work_category,
  total_works bigint,
  verified_works bigint,
  embedded_works bigint,
  last_sync timestamp with time zone,
  first_created timestamp with time zone,
  last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(w.primary_source, 'user_created') AS source,
    w.category,
    COUNT(*)                                          AS total_works,
    COUNT(*) FILTER (WHERE w.is_verified = true)      AS verified_works,
    COUNT(*) FILTER (WHERE w.title_embedding IS NOT NULL) AS embedded_works,
    MAX(w.last_synced_at)                             AS last_sync,
    MIN(w.created_at)                                 AS first_created,
    MAX(w.updated_at)                                 AS last_updated
  FROM works w
  GROUP BY COALESCE(w.primary_source, 'user_created'), w.category
  ORDER BY source, w.category;
END;
$$;

CREATE VIEW works_by_source_stats AS
  SELECT
    COALESCE(primary_source, 'user_created') AS source,
    category,
    count(*)                                         AS total_works,
    count(*) FILTER (WHERE is_verified = true)       AS verified_works,
    count(*) FILTER (WHERE title_embedding IS NOT NULL) AS embedded_works,
    max(last_synced_at)  AS last_sync,
    min(created_at)      AS first_created,
    max(updated_at)      AS last_updated
  FROM works
  GROUP BY COALESCE(primary_source, 'user_created'), category
  ORDER BY COALESCE(primary_source, 'user_created'), category;

-- ─────────────────────────────────────────────────────────────
-- 12. 코멘트 업데이트
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE works IS '작품 마스터 테이블 (사용자 등록 + 외부 ingestion). category: movie|music|book|art|series';
COMMENT ON COLUMN works.creator IS '영화:감독, 음악:아티스트, 책:저자, 미술:작가, 시리즈:크리에이터/감독';
COMMENT ON COLUMN works.year IS '개봉/발매/방영 연도';
COMMENT ON COLUMN works.metadata IS '카테고리별 추가 필드만 저장 (music:music_type, series:seasons/network 등)';
COMMENT ON COLUMN works.original_title IS '원제 (해외 작품)';

COMMIT;
