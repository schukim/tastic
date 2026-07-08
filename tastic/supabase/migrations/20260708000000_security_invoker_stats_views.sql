-- Security Advisor: "Security Definer View" (CRITICAL) 해소
--
-- recent_ingestion_status, works_by_source_stats 두 집계/통계 뷰가 기본
-- SECURITY DEFINER로 동작(뷰 소유자 postgres 권한 실행)해 하위 테이블의
-- RLS를 우회한다. Postgres 15+의 security_invoker=on으로 전환해 뷰가
-- 조회자 권한으로 실행되도록 하여 RLS를 존중하게 한다.
--
-- 개인정보를 담지 않는 통계 뷰이고, 실사용 경로는 service_role(RLS 우회)
-- 또는 works 전체 SELECT가 허용된 authenticated 역할이라 정상 접근에 영향 없음.
--
-- recent_ingestion_status는 인제스션 파이프라인이 리모트에 애드혹 생성하여
-- repo 마이그레이션에 정의가 없을 수 있으므로, 존재할 때만 적용한다(멱등).

do $$
begin
  if to_regclass('public.recent_ingestion_status') is not null then
    execute 'alter view public.recent_ingestion_status set (security_invoker = on)';
  end if;
  if to_regclass('public.works_by_source_stats') is not null then
    execute 'alter view public.works_by_source_stats set (security_invoker = on)';
  end if;
end $$;
