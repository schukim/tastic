// consume_guest_usage 전역 잠금 회귀 방지 테스트.
//
// 전역 일일 상한(GUEST_GLOBAL_LIMITS)은 guest_id 가 위조·회전 가능하다는 전제 아래
// 하루 LLM 비용을 못박는 유일한 방어선이다. 그런데 초기 구현은 직렬화 잠금을
// guest_id + action 으로 잡아서, 서로 다른 UUID 의 동시 요청은 서로를 기다리지 않고
// 각자 낡은 전역 합계를 읽은 뒤 모두 통과했다 — 정확히 그 방어선이 뚫려 있었다.
//
// 실제 동시성 검증은 DB 가 필요해 supabase/tests/guest_usage_concurrency.sql 이 담당한다
// (실행법은 그 파일 주석 참조). 여기서는 DB 없이도 CI 에서 돌 수 있는 회귀 가드를 둔다 —
// 누군가 잠금 키를 다시 guest_id 기준으로 되돌리면 이 테스트가 깨진다.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

/** consume_guest_usage 를 정의하는 마지막 마이그레이션 = 현재 유효한 정의 */
function latestGuestUsageDefinition(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const owning = files.filter((f) =>
    readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").includes(
      "FUNCTION public.consume_guest_usage"
    )
  );

  expect(owning.length).toBeGreaterThan(0);
  return readFileSync(path.join(MIGRATIONS_DIR, owning[owning.length - 1]), "utf8");
}

describe("consume_guest_usage 잠금 범위", () => {
  const sql = latestGuestUsageDefinition();

  it("advisory 잠금을 action + day 로 잡는다 — 서로 다른 guest_id 의 요청도 직렬화된다", () => {
    const lockCall = sql.match(/pg_advisory_xact_lock\(([\s\S]*?)\);/);
    expect(lockCall).not.toBeNull();

    const key = lockCall![1];
    expect(key).toContain("p_action");
    expect(key).toContain("p_day");
  });

  it("잠금 키에 guest_id 를 넣지 않는다 — 넣으면 전역 상한이 동시 요청에 뚫린다", () => {
    const lockCall = sql.match(/pg_advisory_xact_lock\(([\s\S]*?)\);/);
    expect(lockCall![1]).not.toContain("p_guest_id");
  });

  it("전역 합계 확인이 잠금 획득 뒤에 온다", () => {
    const lockAt = sql.indexOf("pg_advisory_xact_lock");
    const sumAt = sql.indexOf("SELECT coalesce(sum(count), 0)");

    expect(lockAt).toBeGreaterThan(-1);
    expect(sumAt).toBeGreaterThan(lockAt);
  });

  it("응답 형식(allowed/reason)과 시그니처를 유지한다 — Edge Function 은 수정 불필요", () => {
    expect(sql).toContain("jsonb_build_object('allowed', false, 'reason', 'global')");
    expect(sql).toContain("jsonb_build_object('allowed', false, 'reason', 'device')");
    expect(sql).toContain("jsonb_build_object('allowed', true, 'reason', NULL)");
    expect(sql).toMatch(/p_guest_id\s+uuid/);
    expect(sql).toMatch(/p_limit\s+int/);
    expect(sql).toMatch(/p_global_limit\s+int/);
  });

  it("service_role 만 실행할 수 있다", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.consume_guest_usage");
    expect(sql).toContain("TO service_role");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.consume_guest_usage[\s\S]*?FROM anon, authenticated/);
  });
});
