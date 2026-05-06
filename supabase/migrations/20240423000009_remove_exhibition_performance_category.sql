-- Remove exhibition and performance from work_category enum
-- PostgreSQL does not support DROP VALUE, so we recreate the type

-- 1. Drop dependent objects
DROP VIEW IF EXISTS works_by_source_stats;
DROP FUNCTION IF EXISTS get_works_stats();
DROP FUNCTION IF EXISTS find_potential_duplicates(text, work_category, text, date, double precision);
DROP FUNCTION IF EXISTS search_works(text, work_category, vector, double precision, double precision, integer);
-- Partial index referencing exhibition/performance enum values must be dropped first
DROP INDEX IF EXISTS idx_works_category_venue_date;

-- 2. Swap enum type
ALTER TYPE work_category RENAME TO work_category_old;
CREATE TYPE work_category AS ENUM ('movie', 'music', 'book', 'art');

ALTER TABLE works
  ALTER COLUMN category TYPE work_category
    USING category::text::work_category;

DROP TYPE work_category_old;

-- 3. Recreate functions (exhibition/performance references removed)

CREATE OR REPLACE FUNCTION public.find_potential_duplicates(
  check_title text,
  check_category work_category,
  check_venue text DEFAULT NULL,
  check_start_date date DEFAULT NULL,
  threshold double precision DEFAULT 0.75
)
RETURNS TABLE(id uuid, title text, venue text, similarity_score double precision, match_type text)
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
    w.venue,
    similarity(w.title_normalized, normalized_check_title)::FLOAT AS similarity_score,
    'title_similarity'::TEXT AS match_type
  FROM works w
  WHERE w.category = check_category
    AND similarity(w.title_normalized, normalized_check_title) > threshold
  ORDER BY similarity_score DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_works_stats()
RETURNS TABLE(source character varying, category work_category, total_works bigint, verified_works bigint, embedded_works bigint, last_sync timestamp with time zone, first_created timestamp with time zone, last_updated timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(w.primary_source, 'user_created') AS source,
    w.category,
    COUNT(*) AS total_works,
    COUNT(*) FILTER (WHERE w.is_verified = true) AS verified_works,
    COUNT(*) FILTER (WHERE w.title_embedding IS NOT NULL) AS embedded_works,
    MAX(w.last_synced_at) AS last_sync,
    MIN(w.created_at) AS first_created,
    MAX(w.updated_at) AS last_updated
  FROM works w
  GROUP BY COALESCE(w.primary_source, 'user_created'), w.category
  ORDER BY source, w.category;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_works(
  query_text text,
  target_category work_category DEFAULT NULL,
  query_embedding vector DEFAULT NULL,
  trigram_weight double precision DEFAULT 0.4,
  embedding_weight double precision DEFAULT 0.6,
  limit_count integer DEFAULT 10
)
RETURNS TABLE(id uuid, title text, category work_category, venue text, start_date date, end_date date, metadata jsonb, primary_source character varying, external_ids jsonb, is_verified boolean, similarity_score double precision, trigram_score double precision, embedding_score double precision, match_reason text)
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

    -- 2. 하이브리드 유사도 검색
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
          WHEN 'movie' THEN CASE WHEN w.metadata->>'director' ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'music' THEN CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'book'  THEN CASE WHEN w.metadata->>'author'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
          WHEN 'art'   THEN CASE WHEN w.metadata->>'artist'   ILIKE '%' || split_part(query_text,' ',1) || '%' THEN 0.2 ELSE 0.0 END
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
$$;

-- 4. Recreate view
CREATE VIEW works_by_source_stats AS
  SELECT
    COALESCE(primary_source, 'user_created') AS source,
    category,
    count(*) AS total_works,
    count(*) FILTER (WHERE is_verified = true) AS verified_works,
    count(*) FILTER (WHERE title_embedding IS NOT NULL) AS embedded_works,
    max(last_synced_at) AS last_sync,
    min(created_at) AS first_created,
    max(updated_at) AS last_updated
  FROM works
  GROUP BY COALESCE(primary_source, 'user_created'), category
  ORDER BY COALESCE(primary_source, 'user_created'), category;
