-- ============================================================
-- consume_guest_usage: 전역 일일 상한의 동시성 결함 수정
--
-- 문제: 기존 구현은 advisory lock 을 guest_id + action 으로 잡았다. 같은 기기의 연타는
--       직렬화되지만, **서로 다른 guest_id** 의 동시 요청끼리는 잠금을 공유하지 않는다.
--       그래서 전역 합계를 읽는 시점(SELECT sum)이 서로 겹치면 모두 상한 미만을 보고
--       통과한 뒤 각자 INSERT 한다 — 전역 상한(GUEST_GLOBAL_LIMITS)이 초과된다.
--
--       guest_id 는 클라이언트가 만드는 값이라 무한 회전이 가능하고, 전역 상한은
--       그 상황에서 하루 LLM 비용을 못박는 유일한 방어선이다. 즉 정확히 이 방어선이
--       동시 요청에 뚫려 있었다.
--
-- 해결: 잠금 키를 action + day 로 바꿔 같은 액션·같은 날의 모든 게스트 요청을 직렬화한다.
--       전역 합계 확인 → 증가가 한 잠금 안에서 원자적으로 끝난다. 기기당 상한은 전역
--       잠금의 부분집합이므로 함께 보호된다(별도 잠금 불필요).
--
--       잠금 구간은 인덱스 조회 1회 + upsert 1회로 매우 짧고, 게스트 트래픽은 상한 자체가
--       하루 수백 건이라 직렬화 비용이 문제되지 않는다.
--
-- 시그니처·한도·반환 형식(jsonb {allowed, reason})은 그대로 유지한다 — Edge Function
-- (_shared/guest.ts) 은 수정 없이 그대로 동작한다.
-- ============================================================

BEGIN;

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
  -- 같은 액션 + 같은 날의 모든 게스트 요청을 직렬화한다 (tx 종료 시 자동 해제).
  -- 키를 guest_id 로 잡으면 서로 다른 기기의 동시 요청이 전역 합계를 각자 낡은 값으로
  -- 읽어 상한을 넘긴다 — 전역 상한을 지키려면 잠금도 전역이어야 한다.
  PERFORM pg_advisory_xact_lock(
    hashtext('guest_usage:' || p_action || ':' || p_day::text)
  );

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

-- CREATE OR REPLACE 는 기존 권한을 유지하지만, 배포 순서가 뒤바뀐 환경에서도
-- 동일한 상태가 되도록 명시적으로 다시 건다(service_role 전용 쓰기 경로).
REVOKE ALL ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) FROM public;
REVOKE ALL ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) TO service_role;

COMMENT ON FUNCTION public.consume_guest_usage(uuid, text, date, int, int) IS
  '게스트 1회 사용 소비. action+day 전역 advisory lock 으로 직렬화해 전역 일일 상한이 동시 요청에 뚫리지 않게 한다.';

COMMIT;
