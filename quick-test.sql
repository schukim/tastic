-- 🎯 5분 완성 DB 검증 테스트
-- Supabase Dashboard SQL Editor에서 실행

-- === 1단계: 기본 인프라 확인 ===
SELECT '=== 기본 인프라 확인 ===' as step;

-- 마이그레이션 히스토리
SELECT version, name FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 6;

-- 핵심 테이블 존재 확인
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('works', 'ingestion_runs');

-- Extension 설치 확인
SELECT extname FROM pg_extension
WHERE extname IN ('pg_trgm', 'vector', 'pg_cron');

-- === 2단계: 핵심 함수 동작 테스트 ===
SELECT '=== 핵심 함수 동작 테스트 ===' as step;

-- normalize_title 함수 테스트
SELECT
  '기생충 (Parasite)' as original,
  normalize_title('기생충 (Parasite)') as normalized;

-- === 3단계: 샘플 데이터로 검색 테스트 ===
SELECT '=== 샘플 데이터 삽입 ===' as step;

-- 테스트용 사용자 ID
DO $$
DECLARE
    test_user_id UUID := '550e8400-e29b-41d4-a716-446655440000'::uuid;
BEGIN
    -- 기존 테스트 데이터 정리
    DELETE FROM works WHERE user_id = test_user_id;

    -- 샘플 데이터 삽입
    INSERT INTO works (id, user_id, category, title, metadata, primary_source, external_ids, is_verified) VALUES
    (gen_random_uuid(), test_user_id, 'movie', '기생충',
     '{"director": "봉준호", "release_year": 2019}',
     'tmdb', '{"tmdb": "496243"}', true),

    (gen_random_uuid(), test_user_id, 'movie', 'Parasite',
     '{"director": "Bong Joon-ho", "release_year": 2019}',
     'tmdb', '{"tmdb": "496243", "imdb": "tt6751668"}', true),

    (gen_random_uuid(), test_user_id, 'exhibition', '한국 현대미술 특별전',
     '{"curator": "김미경"}', 'gov_exhibition', '{"gov_id": "EXH-001"}', true,
     '국립현대미술관 서울관', '2024-03-15', '2024-07-28');

    RAISE NOTICE '✅ 테스트 데이터 3개 삽입 완료';
END $$;

-- === 4단계: search_works 함수 테스트 ===
SELECT '=== 검색 함수 테스트 ===' as step;

-- 4-1. 제목 유사도 검색
SELECT '제목 유사도 검색: 기생충' as test_name;
SELECT title, category, similarity_score, match_reason
FROM search_works(
  query_text := '기생충',
  target_category := 'movie'::work_category,
  limit_count := 3
);

-- 4-2. External ID 완전일치
SELECT 'External ID 매칭: TMDB 496243' as test_name;
SELECT title, similarity_score, match_reason, external_ids
FROM search_works(
  query_text := '496243',
  target_category := 'movie'::work_category
);

-- 4-3. Venue 매칭 (전시/공연)
SELECT 'Venue 매칭: 국립현대미술관' as test_name;
SELECT title, venue, similarity_score, match_reason
FROM search_works(
  query_text := '국립현대미술관',
  target_category := 'exhibition'::work_category
);

-- === 5단계: 성능 및 인덱스 확인 ===
SELECT '=== 성능 테스트 ===' as step;

-- 인덱스 사용 확인 (실행계획)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM works
WHERE title_normalized % normalize_title('기생충');

-- === 6단계: 통계 및 상태 확인 ===
SELECT '=== 상태 확인 ===' as step;

-- 작품 통계
SELECT * FROM get_works_stats();

-- cron job 상태
SELECT * FROM get_cron_jobs_status();

-- === 정리 ===
SELECT '=== 테스트 완료 - 데이터 정리 ===' as step;

-- 테스트 데이터 삭제
DELETE FROM works
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

SELECT '🎉 모든 테스트 완료!' as result;