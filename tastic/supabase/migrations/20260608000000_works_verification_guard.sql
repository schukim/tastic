-- 글로벌 콘텐츠 캐싱: works를 "신뢰 캐시"로 사용하기 위한 검증 가드
--
-- 배경: verify-content(웹서치)로 식별된 작품을 유저가 확정하면 is_verified=true로 승격해
--       전역 캐시로 공유한다(RLS read: is_verified=true → 전원 읽기). 다음 유저는 동일/유사
--       작품 검색 시 웹서치를 스킵하고 캐시된 메타데이터(시놉시스·creator_style·keywords 등)를 재사용.
--
-- 문제: works insert/update RLS는 user_id만 검사하므로, 클라이언트(authenticated)가
--       is_verified=true를 직접 보내면 통과되어 누구나 가짜 메타데이터를 전역 캐시에 심을 수 있다.
--
-- 해결: BEFORE INSERT/UPDATE 트리거로 비특권 롤(authenticated/anon)의 is_verified·verified_at
--       조작을 차단. 승격은 service_role(verify 확정 엣지 함수)에서만 가능.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. verified_at: 캐시로 승격된 시각 (향후 재검증/TTL 용도)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 2. 검증 플래그 가드 트리거
--    - service_role / supabase_admin / postgres(마이그레이션·서버) 만 is_verified=true 설정 가능
--    - 그 외 롤: INSERT는 false 강제, UPDATE는 기존 값 보존(임의 변경 차단)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_works_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
      NEW.verified_at := NULL;
    ELSE  -- UPDATE: 기존 검증 상태를 그대로 유지 (클라가 못 바꾸게)
      NEW.is_verified := OLD.is_verified;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guard_works_verification ON works;
CREATE TRIGGER trigger_guard_works_verification
  BEFORE INSERT OR UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION guard_works_verification();

-- ─────────────────────────────────────────────────────────────
-- 3. 캐시 조회 가속용 부분 인덱스 (신뢰 캐시 행만)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_works_verified_cache
  ON works (category)
  WHERE is_verified = true;

COMMENT ON COLUMN works.verified_at IS 'verify-content 캐시로 승격된 시각. is_verified=true 행에만 채워짐';

COMMIT;
