-- ============================================================
-- consume_guest_usage 전역 상한 / 동시성 테스트
--
-- 실행 (로컬 Supabase 가 떠 있어야 한다):
--   npx supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/guest_usage_concurrency.sql
--
-- 전부 통과하면 마지막에 "ALL GUEST USAGE TESTS PASSED" 가 출력된다. 실패하면 RAISE
-- EXCEPTION 으로 즉시 중단된다. 스크립트는 마지막에 ROLLBACK 하므로 데이터가 남지 않는다.
--
-- 무엇을 검증하나:
--   1. 서로 다른 guest_id 들의 요청 합계가 전역 일일 상한을 넘지 않는다 (reason='global')
--   2. 기기당 상한은 그대로 동작한다 (reason='device')
--   3. 직렬화 잠금이 guest_id 가 아니라 action+day 로 잡힌다 — 이게 이 수정의 핵심이다.
--      guest_id 로 잡으면 서로 다른 UUID 의 동시 요청이 전역 합계를 각자 낡은 값으로 읽고
--      모두 통과해 상한을 넘긴다.
-- ============================================================

BEGIN;

-- 오늘 날짜와 겹치지 않는 과거 날짜를 써서 실제 카운터를 건드리지 않는다.
\set test_day '''1999-01-01'''

DO $$
DECLARE
  v_day        date := '1999-01-01';
  v_result     jsonb;
  v_allowed    int  := 0;
  v_rejected   int  := 0;
  v_global_cap int  := 5;    -- 테스트용 작은 전역 상한
  v_device_cap int  := 100;  -- 기기 상한은 넉넉히 — 1번 테스트에서 걸리지 않게
  v_guest      uuid;
  i            int;
BEGIN
  -- ── 1. 서로 다른 guest_id 로 전역 상한을 넘겨본다 ──
  -- 매 요청이 새 UUID 다(= 기기 상한은 절대 안 걸림). 전역 상한만이 방어선인 상황.
  FOR i IN 1..(v_global_cap + 3) LOOP
    v_guest := gen_random_uuid();
    v_result := public.consume_guest_usage(v_guest, 'search', v_day, v_device_cap, v_global_cap);

    IF (v_result->>'allowed')::boolean THEN
      v_allowed := v_allowed + 1;
    ELSE
      v_rejected := v_rejected + 1;
      IF v_result->>'reason' <> 'global' THEN
        RAISE EXCEPTION 'FAIL(1): 전역 상한 초과인데 reason=% (기대: global)', v_result->>'reason';
      END IF;
    END IF;
  END LOOP;

  IF v_allowed <> v_global_cap THEN
    RAISE EXCEPTION 'FAIL(1): 전역 상한 %건을 넘겨 %건이 통과했다', v_global_cap, v_allowed;
  END IF;
  IF v_rejected <> 3 THEN
    RAISE EXCEPTION 'FAIL(1): 초과분 3건이 거절돼야 하는데 %건 거절됐다', v_rejected;
  END IF;

  -- 실제 저장된 합계도 상한을 넘지 않아야 한다
  PERFORM 1 FROM public.guest_usage
    WHERE action = 'search' AND day = v_day
    HAVING coalesce(sum(count), 0) > v_global_cap;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL(1): guest_usage 합계가 전역 상한을 넘겼다';
  END IF;

  RAISE NOTICE 'PASS(1): 서로 다른 UUID 의 요청 합계가 전역 상한에서 멈춘다';

  -- ── 2. 기기당 상한 ──
  v_guest := gen_random_uuid();
  FOR i IN 1..3 LOOP
    v_result := public.consume_guest_usage(v_guest, 'question', v_day, 2, 1000);
  END LOOP;

  IF (v_result->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL(2): 기기 상한 2회를 넘긴 3번째 요청이 통과했다';
  END IF;
  IF v_result->>'reason' <> 'device' THEN
    RAISE EXCEPTION 'FAIL(2): reason=% (기대: device)', v_result->>'reason';
  END IF;

  RAISE NOTICE 'PASS(2): 기기당 상한이 그대로 동작한다';
END $$;

-- ── 3. 잠금이 전역(action+day)인지 확인 ──
--
-- 위 DO 블록에서 consume_guest_usage 를 호출했으므로 이 트랜잭션은 아직
-- 'guest_usage:search:1999-01-01' advisory 잠금을 쥐고 있다(xact 잠금 = COMMIT/ROLLBACK 까지).
-- 다른 연결에서 같은 키를 잡아보면 실패해야 한다 — 그래야 다른 guest_id 의 동시 요청도
-- 이 구간에서 대기하고, 전역 합계를 낡은 값으로 읽지 않는다.
--
-- dblink 를 쓸 수 없는 환경에서는 이 검사만 건너뛴다(1·2번은 이미 통과).
DO $$
DECLARE
  v_lock_free boolean;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS dblink;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP(3): dblink 를 쓸 수 없어 잠금 범위 검사를 건너뛴다 (%)', SQLERRM;
    RETURN;
  END;

  SELECT t.free INTO v_lock_free
  FROM dblink(
    'dbname=' || current_database(),
    $q$ SELECT pg_try_advisory_xact_lock(hashtext('guest_usage:search:1999-01-01')) $q$
  ) AS t(free boolean);

  IF v_lock_free THEN
    RAISE EXCEPTION
      'FAIL(3): 다른 연결이 action+day 잠금을 곧바로 획득했다 — 잠금이 전역이 아니다(guest_id 별로 잡힘). 동시 요청이 전역 상한을 넘길 수 있다.';
  END IF;

  RAISE NOTICE 'PASS(3): action+day 잠금이 연결 전체를 직렬화한다';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL GUEST USAGE TESTS PASSED'; END $$;

-- 테스트 데이터는 남기지 않는다
ROLLBACK;
