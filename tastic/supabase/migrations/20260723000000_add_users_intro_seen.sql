-- ============================================================
-- users.intro_seen 추가 — 앱 첫 실행 기능 가이드(온보딩 투어) 노출 여부
--
-- 기기 로컬(AsyncStorage) 이 아니라 계정에 저장한다:
--   - 같은 기기에서 다른 계정으로 로그인하면 각자 처음 1회 노출
--   - 같은 계정으로 새 기기에서 로그인해도 이미 봤으면 다시 뜨지 않음
--
-- 업데이트 경로: 클라이언트가 투어 완료/건너뛰기 시 자기 row 를 true 로 갱신.
--   users UPDATE RLS(auth.uid() = id) 로 본인만 수정 가능하고,
--   plan 가드 트리거(20260713)는 plan 만 덮어쓰므로 이 컬럼엔 영향 없음.
-- ============================================================

alter table public.users
  add column if not exists intro_seen boolean not null default false;
