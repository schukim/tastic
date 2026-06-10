-- 기존 유저 전원 developer 플랜 부여 (2026-06-10 시점 일괄 변경)
-- developer: 모든 한도(hard limit 포함) 미적용, UI 비노출 내부용 플랜.
-- 이후 신규 가입자는 컬럼 기본값에 따라 free로 시작한다.

update public.users set plan = 'developer' where plan <> 'developer';
