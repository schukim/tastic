-- ============================================================
-- works 전역 캐시 무결성 보강 (3건)
--
-- 1. verified 행 클라이언트 수정 차단:
--    기존 가드(20260608)는 is_verified/verified_at 컬럼만 보호해서,
--    소유자가 승격된(전 유저 공유) 행의 title/creator/metadata 를 바꿔
--    전역 캐시를 오염시킬 수 있었다. verified 행은 비특권 롤에게 읽기 전용.
--    (클라이언트 정상 플로우엔 works UPDATE 가 없어 영향 없음)
--
-- 2. works UPDATE 정책 WITH CHECK 보강 — user_id 를 타인으로 변조 차단.
--
-- 3. usage_logs.action 에 'work_save' 추가 —
--    save-verified-work 의 유저별 일일 호출 상한(비용 남용 방어)용.
-- ============================================================

BEGIN;

-- 1. 가드 트리거 확장 (기존 트리거가 이 함수를 사용하므로 함수 교체만으로 적용)
CREATE OR REPLACE FUNCTION guard_works_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
      NEW.verified_at := NULL;
    ELSE  -- UPDATE
      -- 전역 캐시로 승격된 행은 비특권 롤에게 읽기 전용 (메타데이터 오염 차단)
      IF OLD.is_verified THEN
        RAISE EXCEPTION 'verified works are read-only for clients'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- 미승격 행: 검증 상태 컬럼만 보존 (기존 동작 유지)
      NEW.is_verified := OLD.is_verified;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. UPDATE 정책 WITH CHECK 보강
DROP POLICY IF EXISTS "Users can update own works" ON works;
CREATE POLICY "Users can update own works" ON works
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. usage_logs.action 확장
ALTER TABLE public.usage_logs
  DROP CONSTRAINT IF EXISTS usage_logs_action_check;

ALTER TABLE public.usage_logs
  ADD CONSTRAINT usage_logs_action_check
  CHECK (action IN ('review', 'analysis', 'recommendation', 'search', 'question', 'work_save'));

COMMIT;
