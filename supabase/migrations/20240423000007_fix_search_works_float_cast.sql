-- search_works 함수 float 타입 불일치 수정
--
-- 문제: similarity() → real(float4), RETURNS TABLE → FLOAT(float8) → 타입 불일치
-- 수정: trigram_score, embedding_score, similarity_score 계산식에 ::FLOAT 명시 캐스팅

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
  WITH candidates AS (
    -- 1. External ID 완전일치 (최우선)
    SELECT
      w.id, w.title, w.category, w.venue, w.start_date, w.end_date,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      1.0::FLOAT AS similarity_score,
      1.0::FLOAT AS trigram_score,
      1.0::FLOAT AS embedding_score,
      'external_id_match'::TEXT AS match_reason
    FROM works w
    WHERE (target_category IS NULL OR w.category = target_category)
      AND w.external_ids ?| ARRAY['tmdb','imdb','musicbrainz','isbn','kopis','openlibrary']
      AND (
        (w.external_ids->>'tmdb'         = query_text) OR
        (w.external_ids->>'imdb'         = query_text) OR
        (w.external_ids->>'musicbrainz'  = query_text) OR
        (w.external_ids->>'isbn'         = query_text) OR
        (w.external_ids->>'kopis'        = query_text) OR
        (w.external_ids->>'openlibrary'  = query_text)
      )

    UNION ALL

    -- 2. 전시/공연 venue 매칭 (높은 우선순위)
    SELECT
      w.id, w.title, w.category, w.venue, w.start_date, w.end_date,
      w.metadata, w.primary_source, w.external_ids, w.is_verified,
      0.95::FLOAT AS similarity_score,
      0.8::FLOAT  AS trigram_score,
      0.8::FLOAT  AS embedding_score,
      'venue_date_match'::TEXT AS match_reason
    FROM works w
    WHERE (target_category IS NULL OR w.category = target_category)
      AND w.category IN ('exhibition', 'performance')
      AND w.venue IS NOT NULL
      AND w.venue ILIKE '%' || query_text || '%'
      AND NOT (
        w.external_ids ?| ARRAY['tmdb','imdb','musicbrainz','isbn','kopis','openlibrary'] AND (
          (w.external_ids->>'tmdb'        = query_text) OR
          (w.external_ids->>'imdb'        = query_text) OR
          (w.external_ids->>'musicbrainz' = query_text) OR
          (w.external_ids->>'isbn'        = query_text) OR
          (w.external_ids->>'kopis'       = query_text) OR
          (w.external_ids->>'openlibrary' = query_text)
        )
      )

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
          WHEN 'movie' THEN
            CASE WHEN w.metadata->>'director' ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'music' THEN
            CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'book'  THEN
            CASE WHEN w.metadata->>'author'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'art'   THEN
            CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'exhibition' THEN
            CASE WHEN w.venue ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.15 ELSE 0.0 END
          WHEN 'performance' THEN
            CASE WHEN w.venue ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.15 ELSE 0.0 END
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
    WHERE (target_category IS NULL OR w.category = target_category)
      AND (
        w.title_normalized % normalized_query OR
        similarity(w.title_normalized, normalized_query) > trigram_threshold OR
        (query_embedding IS NOT NULL AND w.title_embedding IS NOT NULL)
      )
      AND NOT (
        (
          w.external_ids ?| ARRAY['tmdb','imdb','musicbrainz','isbn','kopis','openlibrary'] AND (
            (w.external_ids->>'tmdb'        = query_text) OR
            (w.external_ids->>'imdb'        = query_text) OR
            (w.external_ids->>'musicbrainz' = query_text) OR
            (w.external_ids->>'isbn'        = query_text) OR
            (w.external_ids->>'kopis'       = query_text) OR
            (w.external_ids->>'openlibrary' = query_text)
          )
        ) OR (
          w.category IN ('exhibition','performance')
          AND w.venue IS NOT NULL
          AND w.venue ILIKE '%' || query_text || '%'
        )
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

-- find_potential_duplicates도 동일한 float 캐스팅 수정
CREATE OR REPLACE FUNCTION find_potential_duplicates(
  check_title TEXT,
  check_category work_category,
  check_venue TEXT DEFAULT NULL,
  check_start_date DATE DEFAULT NULL,
  threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  venue TEXT,
  similarity_score FLOAT,
  match_type TEXT
) AS $$
DECLARE
  normalized_check_title TEXT;
BEGIN
  normalized_check_title := normalize_title(check_title);

  RETURN QUERY
  SELECT
    w.id,
    w.title,
    w.venue,
    CASE
      WHEN check_venue IS NOT NULL
           AND w.venue IS NOT NULL
           AND w.venue ILIKE '%' || check_venue || '%'
           AND w.category IN ('exhibition','performance')
           AND (check_start_date IS NULL OR w.start_date = check_start_date)
      THEN 0.95::FLOAT
      ELSE similarity(w.title_normalized, normalized_check_title)::FLOAT
    END AS similarity_score,
    CASE
      WHEN check_venue IS NOT NULL
           AND w.venue IS NOT NULL
           AND w.venue ILIKE '%' || check_venue || '%'
           AND w.category IN ('exhibition','performance')
      THEN 'venue_match'::TEXT
      ELSE 'title_similarity'::TEXT
    END AS match_type
  FROM works w
  WHERE w.category = check_category
    AND (
      (similarity(w.title_normalized, normalized_check_title) > threshold)
      OR (
        check_venue IS NOT NULL
        AND w.venue IS NOT NULL
        AND w.venue ILIKE '%' || check_venue || '%'
        AND w.category IN ('exhibition','performance')
      )
    )
  ORDER BY similarity_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION search_works FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_works TO authenticated, service_role;

REVOKE ALL ON FUNCTION find_potential_duplicates FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_potential_duplicates TO authenticated, service_role;

COMMIT;
