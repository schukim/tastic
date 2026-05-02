-- 외부 콘텐츠 수집 및 작품 매칭을 위한 기본 스키마 설정
--
-- 목적: Extensions 활성화, 기본 타입 생성, 테이블 구조 정의
-- 롤백: 이 마이그레이션은 기존 데이터를 변경하지 않으므로 안전하게 롤백 가능
--        필요시 DROP TABLE ingestion_runs, ALTER TABLE works DROP COLUMN 등으로 롤백

BEGIN;

-- 1. Extensions 활성화
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. work_category enum 타입 생성
DO $$ BEGIN
    CREATE TYPE work_category AS ENUM ('movie', 'music', 'book', 'art', 'exhibition', 'performance');
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'work_category enum already exists, skipping';
END $$;

-- 3. works 테이블 확장
-- 기본 테이블이 없다면 완전히 새로 생성
CREATE TABLE IF NOT EXISTS works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category work_category NOT NULL,
  title TEXT NOT NULL,
  title_normalized TEXT,

  -- 전시/공연 공통 필드 승격
  venue TEXT,
  start_date DATE,
  end_date DATE,

  -- 카테고리별 메타데이터
  metadata JSONB NOT NULL DEFAULT '{}',

  -- 유사도 검색 최적화
  title_embedding VECTOR(384),

  -- External ingestion 필드 (수정된 스키마)
  primary_source VARCHAR,
  contributing_sources VARCHAR[] DEFAULT '{}',
  external_ids JSONB DEFAULT '{}',
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR DEFAULT 'synced',

  -- 검증 및 메타
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 기존 테이블이 있다면 새 컬럼들 추가
DO $$ BEGIN
  -- 매칭 최적화 필드
  ALTER TABLE works ADD COLUMN IF NOT EXISTS title_normalized TEXT;
  ALTER TABLE works ADD COLUMN IF NOT EXISTS title_embedding VECTOR(384);

  -- 전시/공연 공통 필드 승격
  ALTER TABLE works ADD COLUMN IF NOT EXISTS venue TEXT;
  ALTER TABLE works ADD COLUMN IF NOT EXISTS start_date DATE;
  ALTER TABLE works ADD COLUMN IF NOT EXISTS end_date DATE;

  -- External ingestion 필드 (수정된 스키마)
  ALTER TABLE works ADD COLUMN IF NOT EXISTS primary_source VARCHAR;
  ALTER TABLE works ADD COLUMN IF NOT EXISTS contributing_sources VARCHAR[] DEFAULT '{}';
  ALTER TABLE works ADD COLUMN IF NOT EXISTS external_ids JSONB DEFAULT '{}';
  ALTER TABLE works ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE works ADD COLUMN IF NOT EXISTS sync_status VARCHAR DEFAULT 'synced';
  ALTER TABLE works ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

  -- metadata가 없다면 추가
  ALTER TABLE works ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

  RAISE NOTICE 'works table columns added successfully';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Some works table columns may already exist: %', SQLERRM;
END $$;

-- 4. ingestion_runs 테이블 생성 (수정된 스키마)
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR NOT NULL,
  job_type VARCHAR NOT NULL DEFAULT 'incremental',
  status VARCHAR NOT NULL DEFAULT 'running',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,  -- finished_at에서 변경
  cursor_position TEXT,
  records_processed INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  stats JSONB DEFAULT '{}',  -- 새 필드
  error TEXT,  -- error_message에서 변경
  retry_count INTEGER DEFAULT 0
);

-- 5. title_normalized 자동 생성 함수
CREATE OR REPLACE FUNCTION normalize_title(title TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(title, '^(the|a|an)\s+', '', 'i'),  -- 영문 관사 제거
          '[의|을|를|이|가|은|는|으로|로]$', '', 'g'         -- 한글 조사 제거
        ),
        '[^a-zA-Z0-9가-힣\s]', '', 'g'                      -- 특수문자 제거
      ),
      '\s+', ' ', 'g'                                        -- 공백 정규화
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 6. title_normalized 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_title_normalized() RETURNS TRIGGER AS $$
BEGIN
  NEW.title_normalized := normalize_title(NEW.title);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_title_normalized ON works;
CREATE TRIGGER trigger_update_title_normalized
  BEFORE INSERT OR UPDATE OF title ON works
  FOR EACH ROW EXECUTE FUNCTION update_title_normalized();

-- 7. 기존 데이터의 title_normalized 필드 업데이트
UPDATE works SET title_normalized = normalize_title(title)
WHERE title_normalized IS NULL AND title IS NOT NULL;

-- 8. 테이블 코멘트
COMMENT ON TABLE works IS '작품 마스터 테이블 - 사용자 등록 + 외부 소스 ingestion (venue/start_date/end_date 공통 필드 승격)';
COMMENT ON TABLE ingestion_runs IS '외부 소스 동기화 실행 로그 (수정된 스키마: completed_at, stats, error)';
COMMENT ON FUNCTION normalize_title IS '제목 정규화 - 매칭 성능 향상용';

COMMIT;