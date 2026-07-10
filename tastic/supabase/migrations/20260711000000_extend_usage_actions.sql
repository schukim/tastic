-- ============================================================
-- usage_logs.action 확장: 'search'(작품 검색), 'question'(질문 생성) 추가
-- verify-content·generate-question 의 유저별 일일 호출 상한(비용 남용 방어)에
-- consume_usage RPC 를 재사용하기 위함. 이 두 액션은 플랜 한도가 아니라
-- 순수 abuse ceiling 용도(consume_usage 의 hard limit 경로만 사용).
-- ============================================================

alter table public.usage_logs
  drop constraint if exists usage_logs_action_check;

alter table public.usage_logs
  add constraint usage_logs_action_check
  check (action in ('review', 'analysis', 'recommendation', 'search', 'question'));
