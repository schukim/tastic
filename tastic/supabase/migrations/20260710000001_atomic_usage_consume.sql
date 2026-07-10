-- ============================================================
-- 사용량 제한 원자화 (TOCTOU 레이스 제거)
-- 기존: Edge Function이 count 조회 → LLM 응답 → insert (사이에 레이스 창)
-- 변경: 단일 RPC 안에서 tx-advisory-lock + count + insert 를 원자적으로 수행.
--       동일 (user_id, action) 동시 요청은 직렬화되어 무료 한도 우회 불가.
-- 실패 시 예약 롤백은 Edge Function이 반환된 id로 delete 하여 처리.
-- ============================================================

create or replace function public.consume_usage(
  p_user_id       uuid,
  p_action        text,
  p_ref_id        uuid,
  p_check_period  boolean,      -- free 플랜만 true
  p_period_start  timestamptz,
  p_period_limit  int,
  p_check_hard    boolean,      -- free·membership true, developer false
  p_day_start     timestamptz,
  p_hard_limit    int
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

  -- 비공개 hard limit (일일)
  if p_check_hard then
    select count(*) into v_count
      from public.usage_logs
      where user_id = p_user_id and action = p_action and created_at >= p_day_start;
    if v_count >= p_hard_limit then
      return jsonb_build_object('allowed', false, 'reason', 'hard');
    end if;
  end if;

  -- 플랜 한도 (free: day/week)
  if p_check_period then
    select count(*) into v_count
      from public.usage_logs
      where user_id = p_user_id and action = p_action and created_at >= p_period_start;
    if v_count >= p_period_limit then
      return jsonb_build_object('allowed', false, 'reason', 'period');
    end if;
  end if;

  insert into public.usage_logs (user_id, action, ref_id)
    values (p_user_id, p_action, p_ref_id)
    returning id into v_id;

  return jsonb_build_object('allowed', true, 'counted', true, 'id', v_id);
end;
$$;

-- 쓰기 경로이므로 service_role(Edge Function)만 실행 가능
revoke all on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int) from public;
revoke all on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int) from anon, authenticated;
grant execute on function public.consume_usage(uuid, text, uuid, boolean, timestamptz, int, boolean, timestamptz, int) to service_role;
