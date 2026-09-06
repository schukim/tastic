-- ============================================================
-- 캐시 별칭 매칭 — works.original_title_normalized + search_works 원제 반영
--
-- 왜: 지금 search_works 는 title_normalized 만 본다. 유저가 원제("Power Ballad")로
--     검색하면 국내명("파워 발라드")으로 저장된 캐시 행에 절대 닿지 못하고,
--     반대도 마찬가지다. 별칭으로는 캐시가 구조적으로 안 맞는다.
--
-- 방법: original_title 의 정규화 컬럼을 두고 trigram 인덱스를 건 뒤,
--       유사도를 title / original_title 중 **높은 쪽**으로 계산한다.
--       기존 title 매칭 동작은 그대로 유지된다(점수가 내려갈 일이 없음).
-- ============================================================

-- 1. 정규화 컬럼
ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS original_title_normalized TEXT;

-- 2. 트리거가 title 과 함께 original_title 도 정규화하도록 교체
CREATE OR REPLACE FUNCTION public.handle_works_before_upsert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.title_normalized := normalize_title(NEW.title);
  NEW.original_title_normalized := CASE
    WHEN NEW.original_title IS NULL OR trim(NEW.original_title) = '' THEN NULL
    ELSE normalize_title(NEW.original_title)
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. 기존 행 백필
UPDATE public.works
SET original_title_normalized = normalize_title(original_title)
WHERE original_title IS NOT NULL
  AND trim(original_title) <> ''
  AND original_title_normalized IS DISTINCT FROM normalize_title(original_title);

-- 4. trigram 인덱스 (title_normalized 인덱스와 동일한 방식)
CREATE INDEX IF NOT EXISTS idx_works_original_title_normalized_trgm
  ON public.works USING gin (original_title_normalized gin_trgm_ops);

-- 5. search_works: 유사도를 title / original_title 중 높은 쪽으로
--    반환 시그니처는 그대로라 호출부(verify-content)는 수정이 필요 없다.
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

    SELECT
      w.id, w.title, w.category, w.original_title, w.creator, w.year, w.genre,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      LEAST(1.0, (
        -- 제목/원제 중 높은 쪽 — 국내명으로 저장된 행을 원제로도 찾을 수 있게 한다.
        GREATEST(
          COALESCE(similarity(w.title_normalized, normalized_query), 0),
          COALESCE(similarity(w.original_title_normalized, normalized_query), 0)
        )::FLOAT * trigram_weight
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
      GREATEST(
        COALESCE(similarity(w.title_normalized, normalized_query), 0),
        COALESCE(similarity(w.original_title_normalized, normalized_query), 0)
      )::FLOAT AS trigram_score,
      CASE
        WHEN query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL
        THEN (1 - (w.title_embedding <=> query_embedding))::FLOAT
        ELSE 0.0
      END AS embedding_score,
      -- 원제 쪽이 더 높으면 그 사실을 남긴다(캐시 히트 원인 추적용)
      CASE
        WHEN COALESCE(similarity(w.original_title_normalized, normalized_query), 0)
             > COALESCE(similarity(w.title_normalized, normalized_query), 0)
        THEN 'original_title_match'
        ELSE 'similarity_match'
      END::TEXT AS match_reason
    FROM works w
    LEFT JOIN external_id_match_flag em ON w.id = em.work_id
    WHERE (target_category IS NULL OR w.category = target_category)
      AND em.work_id IS NULL
      AND (
        w.title_normalized % normalized_query
        OR similarity(w.title_normalized, normalized_query) > trigram_threshold
        OR w.original_title_normalized % normalized_query
        OR similarity(w.original_title_normalized, normalized_query) > trigram_threshold
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

REVOKE ALL ON FUNCTION public.search_works FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_works TO authenticated, service_role;
