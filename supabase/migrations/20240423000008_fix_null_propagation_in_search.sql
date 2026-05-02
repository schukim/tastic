-- search_works NULL 전파 버그 수정
--
-- 버그: external_ids에 일부 키만 있을 때 (예: tmdb만 있고 imdb 없음)
--       `external_ids->>'imdb'` → NULL, `NULL = query_text` → NULL
--       OR 체인이 NULL로 전파 → NOT NULL = NULL → 행이 WHERE에서 제외됨
--
-- 수정: 키 존재 여부(? 연산자)를 먼저 확인한 후 값 비교

BEGIN;

DROP FUNCTION IF EXISTS search_works;

CREATE OR REPLACE FUNCTION search_works(
  query_text TEXT,
  target_category work_category DEFAULT NULL,
  query_embedding VECTOR(384) DEFAULT NULL,
  trigram_weight FLOAT DEFAULT 0.4,
  embedding_weight FLOAT DEFAULT 0.6,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category work_category,
  venue TEXT,
  start_date DATE,
  end_date DATE,
  metadata JSONB,
  primary_source VARCHAR,
  external_ids JSONB,
  is_verified BOOLEAN,
  similarity_score FLOAT,
  trigram_score FLOAT,
  embedding_score FLOAT,
  match_reason TEXT
) AS $$
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
  -- 외부 ID 완전일치 판정 (키 존재 여부 먼저 확인하여 NULL 전파 방지)
  external_id_match_flag AS (
    SELECT w.id AS work_id, TRUE AS matched
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
      w.id, w.title, w.category, w.venue, w.start_date, w.end_date,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      1.0::FLOAT AS similarity_score,
      1.0::FLOAT AS trigram_score,
      1.0::FLOAT AS embedding_score,
      'external_id_match'::TEXT AS match_reason
    FROM works w
    INNER JOIN external_id_match_flag em ON w.id = em.work_id

    UNION ALL

    -- 2. 전시/공연 venue 매칭
    SELECT
      w.id, w.title, w.category, w.venue, w.start_date, w.end_date,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      0.95::FLOAT AS similarity_score,
      0.8::FLOAT  AS trigram_score,
      0.8::FLOAT  AS embedding_score,
      'venue_date_match'::TEXT AS match_reason
    FROM works w
    LEFT JOIN external_id_match_flag em ON w.id = em.work_id
    WHERE (target_category IS NULL OR w.category = target_category)
      AND em.work_id IS NULL  -- 이미 external_id_match에서 잡힌 건 제외
      AND w.category IN ('exhibition', 'performance')
      AND w.venue IS NOT NULL
      AND w.venue ILIKE '%' || query_text || '%'

    UNION ALL

    -- 3. 하이브리드 유사도 검색
    SELECT
      w.id, w.title, w.category, w.venue, w.start_date, w.end_date,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      LEAST(1.0, (
        COALESCE(similarity(w.title_normalized, normalized_query), 0)::FLOAT * trigram_weight +
        CASE
          WHEN query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL
          THEN (1 - (w.title_embedding <=> query_embedding))::FLOAT * embedding_weight
          ELSE 0.0
        END +
        CASE w.category
          WHEN 'movie'       THEN CASE WHEN w.metadata->>'director' ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'music'       THEN CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'book'        THEN CASE WHEN w.metadata->>'author'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'art'         THEN CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'exhibition'  THEN CASE WHEN w.venue ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.15 ELSE 0.0 END
          WHEN 'performance' THEN CASE WHEN w.venue ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.15 ELSE 0.0 END
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
      AND em.work_id IS NULL  -- external_id_match에서 잡힌 건 제외
      AND NOT (
        w.category IN ('exhibition','performance')
        AND w.venue IS NOT NULL
        AND w.venue ILIKE '%' || query_text || '%'
      )
      AND (
        w.title_normalized % normalized_query OR
        similarity(w.title_normalized, normalized_query) > trigram_threshold OR
        (query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION search_works FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_works TO authenticated, service_role;

COMMIT;
