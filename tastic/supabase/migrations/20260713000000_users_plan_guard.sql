-- ============================================================
-- users.plan 가드: 클라이언트의 플랜 자가 승급 차단
--
-- 문제: users UPDATE RLS 정책은 auth.uid() = id 만 검사하고 컬럼 제한이
--       없어, 클라이언트(authenticated)가 자기 row 에 plan='membership' 을
--       직접 PATCH 하면 결제 없이 멤버십 혜택을 얻을 수 있다.
--       (서버 사용량 검증도 users.plan 을 신뢰하므로 전부 뚫린다.)
--
-- 해결: works.is_verified 가드(20260608)와 동일한 패턴 —
--       BEFORE INSERT/UPDATE 트리거로 비특권 롤의 plan 변경을 무시한다.
--       plan 변경은 service_role(revenuecat-webhook)과 DB 관리자만 가능.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION guard_users_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan := 'free';
    ELSE  -- UPDATE: 기존 plan 을 그대로 유지 (클라가 못 바꾸게)
      NEW.plan := OLD.plan;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guard_users_plan ON public.users;
CREATE TRIGGER trigger_guard_users_plan
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION guard_users_plan();

-- UPDATE 정책에 WITH CHECK 보강 — 갱신 후 row 도 본인 소유여야 함 (id 변조 차단)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;
