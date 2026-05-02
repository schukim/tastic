-- 기본 DB 구조 확인 테스트
-- 1. 테이블 존재 확인
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('works', 'ingestion_runs')
ORDER BY table_name;

-- 2. Extension 설치 확인
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_trgm', 'vector', 'pg_cron');

-- 3. works 테이블 구조 확인
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'works'
  AND column_name IN ('title_normalized', 'venue', 'external_ids', 'title_embedding')
ORDER BY ordinal_position;

-- 4. 주요 인덱스 존재 확인
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'works'
  AND indexname LIKE '%trigram%' OR indexname LIKE '%external%' OR indexname LIKE '%venue%'
ORDER BY indexname;

-- 5. RPC 함수 존재 확인
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('search_works', 'normalize_title', 'get_works_stats');