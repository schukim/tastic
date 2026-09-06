-- ============================================================
-- 온보딩 그레이스 (신규 무료 유저의 첫 N편 일일 한도 면제)
--
-- 왜: 분석·추천이 평론 3편에서 열리는데 무료 한도가 하루 1편이라,
--     신규 유저는 3일차에야 앱의 절반을 처음 본다. 가치를 확인하기 전에
--     3일을 요구하는 구조라 이탈이 크다. → 계정 생애 최초 N편은 일일
--     한도를 적용하지 않아 첫날에 전 기능을 체험할 수 있게 한다.
--
-- 설계: 기간 리셋이 아니라 lifetime 카운트다. 유저가 평생 한 번만 받는
--       분량이라 반복 획득 표면이 없고, "3편 = 언락"과 정확히 맞물린다.
--       hard limit(비용 상한)은 그레이스와 무관하게 항상 적용한다 —
--       그레이스는 플랜 한도 면제일 뿐 비용 방어를 뚫는 장치가 아니다.
--
-- create or replace 로는 시그니처를 바꿀 수 없어(오버로드가 생겨 모호해짐)
-- 기존 9인자 함수를 drop 후 재생성하고 권한을 다시 부여한다.
-- ============================================================

drop function if exists public.consume_usage(
  uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int
);

create or replace function public.consume_usage(
  p_user_id       uuid,
  p_action        text,
  p_ref_id        uuid,
  p_check_period  boolean,      -- free 플랜만 true
  p_period_start  timestamptz,
  p_period_limit  int,
  p_check_hard    boolean,      -- free·membership true, developer false
  p_day_start     timestamptz,
  p_hard_limit    int,
  p_grace_limit   int default 0 -- 생애 최초 N건은 기간 한도 면제 (0이면 비활성)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_count    int;
  v_id       uuid;
begin
  -- 같은 유저+액션 요청을 직렬화 (tx 종료 시 자동 해제)
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_action));

  -- 멱등: 동일 ref_id는 이미 카운트됨 (평론 재생성 등)
  if p_ref_id is not null then
    select id into v_existing
      from public.usage_logs
      where user_id = p_user_id and action = p_action and ref_id = p_ref_id
      limit 1;
    if v_existing is not null then
      return jsonb_build_object('allowed', true, 'counted', false, 'id', null);
    end if;
  end if;

  -- 비공개 hard limit (일일) — 그레이스보다 먼저, 항상 적용
  if p_check_hard then
    select count(*) into v_count
      from public.usage_logs
      where user_id = p_user_id and action = p_action and created_at >= p_day_start;
    if v_count >= p_hard_limit then
      return jsonb_build_object('allowed', false, 'reason', 'hard');
    end if;
  end if;

  -- 플랜 한도 (free: day/week) — 단, 온보딩 그레이스 잔여분이 있으면 면제
  if p_check_period then
    if p_grace_limit > 0 then
      select count(*) into v_count
        from public.usage_logs
        where user_id = p_user_id and action = p_action;
    end if;

    if p_grace_limit <= 0 or v_count >= p_grace_limit then
      select count(*) into v_count
        from public.usage_logs
        where user_id = p_user_id and action = p_action and created_at >= p_period_start;
      if v_count >= p_period_limit then
        return jsonb_build_object('allowed', false, 'reason', 'period');
      end if;
    end if;
  end if;

  insert into public.usage_logs (user_id, action, ref_id)
    values (p_user_id, p_action, p_ref_id)
    returning id into v_id;

  return jsonb_build_object('allowed', true, 'counted', true, 'id', v_id);
end;
$$;

-- 쓰기 경로이므로 service_role(Edge Function)만 실행 가능
revoke all on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int, int) from public;
revoke all on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int, int) from anon, authenticated;
grant execute on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int, int) to service_role;
