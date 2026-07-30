#!/usr/bin/env bash
# consume_guest_usage 전역 상한/동시성 테스트를 일회용 Postgres 컨테이너에서 돌린다.
#
#   bash supabase/tests/run-guest-usage-test.sh
#
# 전체 Supabase 스택(supabase start)을 띄우지 않는다 — 이 마이그레이션이 건드리는 것은
# guest_usage 테이블과 consume_guest_usage 함수뿐이고, 둘 다 Supabase 고유 기능에
# 의존하지 않기 때문이다. 필요한 롤(anon/authenticated/service_role)만 미리 만들어 준다.
set -euo pipefail

CONTAINER="tastic-guest-usage-test"
IMAGE="postgres:15"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "▸ Postgres 컨테이너 기동 ($IMAGE)"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$IMAGE" >/dev/null

until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

psql() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "▸ Supabase 롤 생성"
psql -q <<'SQL'
DO $$ BEGIN
  CREATE ROLE anon;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL

echo "▸ guest_usage 마이그레이션 적용"
psql -q -f - < "$MIGRATIONS/20260728000000_guest_usage.sql"
psql -q -f - < "$MIGRATIONS/20260730000000_guest_usage_global_lock.sql"

echo "▸ 테스트 실행"
psql -f - < "$HERE/guest_usage_concurrency.sql"
