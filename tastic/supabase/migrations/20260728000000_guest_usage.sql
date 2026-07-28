-- ============================================================
-- 게스트(비로그인 체험) 사용량 추적
--
-- 배경: App Store 심사 가이드라인 5.1.1(v) — 계정 기반이 아닌 콘텐츠는 회원가입 없이
--       이용할 수 있어야 한다. 그래서 로그인 없이 인터뷰 1회 → 평론 생성까지 체험할 수
--       있게 열되, LLM 호출은 전부 Edge Function 을 거치므로 서버에도 게스트 경로가 필요하다.
--
-- 식별: Supabase 익명 인증을 쓰지 않는다(세션 병합 복잡도 회피). 대신 클라이언트가
--       기기 로컬에 생성·보관하는 UUID 를 x-guest-id 헤더로 보낸다.
--
-- 위조 가능성: 기기 UUID 는 클라이언트가 만드는 값이라 재설치·조작으로 갱신될 수 있다.
--       그래서 2단 방어를 둔다.
--         1) 기기당 일일 상한 — 정상 사용자의 오작동·연타 방어
--         2) 액션별 전역 일일 상한 — UUID 를 무한 회전시켜도 하루 총비용이 고정된다
--       전역 상한에 걸리면 게스트에게 "체험이 잠시 마감됨(로그인하면 계속 가능)"을 안내한다.
--
-- 보관: 게스트 행은 익명 카운터이며 30일 지난 행은 기회적으로 삭제한다.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_usage (
  guest_id   uuid NOT NULL,
  action     text NOT NULL CHECK (action IN ('search', 'question', 'review', 'work_save')),
  day        date NOT NULL,
  count      int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, action, day)
);

-- 전역 상한 집계(액션+당일 합계)용
CREATE INDEX IF NOT EXISTS idx_guest_usage_action_day
  ON public.guest_usage (action, day);

-- 정책을 만들지 않는다 = 비특권 롤(anon/authenticated) 전면 차단. service_role 만 접근.
ALTER TABLE public.guest_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_guest_usage(
  p_guest_id     uuid,
  p_action       text,
  p_day          date,
  p_limit        int,   -- 기기당 일일 상한
  p_global_limit int    -- 액션별 전역 일일 상한(서킷 브레이커)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count  int;
  v_global bigint;
BEGIN
  -- 같은 기기+액션 요청을 직렬화 (tx 종료 시 자동 해제)
  PERFORM pg_advisory_xact_lock(hashtext(p_guest_id::text || ':' || p_action));

  -- 전역 상한을 먼저 본다 — 기기 UUID 는 위조 가능하므로 총량이 실질적인 비용 상한이다.
  SELECT coalesce(sum(count), 0) INTO v_global
    FROM public.guest_usage
    WHERE action = p_action AND day = p_day;

  IF v_global >= p_global_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'global');
  END IF;

  INSERT INTO public.guest_usage (guest_id, action, day, count)
    VALUES (p_guest_id, p_action, p_day, 1)
    ON CONFLICT (guest_id, action, day)
    DO UPDATE SET count = public.guest_usage.count + 1, updated_at = now()
    RETURNING count INTO v_count;

  -- 오래된 익명 카운터 정리 — 매 호출마다 훑지 않도록 기회적으로만 수행
  IF random() < 0.01 THEN
    DELETE FROM public.guest_usage WHERE day < p_day - 30;
  END IF;

  IF v_count > p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'device');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', NULL);
END;
$$;

-- 쓰기 경로이므로 service_role(Edge Function)만 실행 가능
REVOKE ALL ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) FROM public;
REVOKE ALL ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) TO service_role;

COMMENT ON TABLE public.guest_usage IS
  '비로그인 게스트 체험의 액션별 일일 카운터. guest_id 는 기기 로컬 UUID(위조 가능) — 전역 상한과 함께 사용.';

COMMIT;
