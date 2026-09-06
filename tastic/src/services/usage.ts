import { supabase } from "./supabase";
import { periodStart, type UsagePeriod } from "../utils/usagePeriod";
import type { UsageAction, UserPlan } from "../types/database";

// 무료 플랜 제한: 평론 하루 1회, 추천 하루 1회, 분석 주 1회.
// 프론트 사전 체크용 — 최종 검증은 Edge Function(서버사이드)에서 수행한다.
export const FREE_LIMITS: Record<UsageAction, { max: number; period: UsagePeriod }> = {
  review: { max: 1, period: "day" },
  recommendation: { max: 1, period: "day" },
  analysis: { max: 1, period: "week" },
};

// 온보딩 그레이스 — 계정 생애 최초 N건은 일일/주간 한도를 적용하지 않는다.
// 신규 유저가 첫날에 평론 3편을 써서 분석·추천까지 체험할 수 있게 하는 장치.
// 서버 supabase/functions/_shared/usage.ts 의 FREE_GRACE 와 반드시 동일해야 한다.
export const FREE_GRACE: Record<UsageAction, number> = {
  review: 3,
  recommendation: 0,
  analysis: 0,
};

// 그레이스 잔여 건수. 0이면 소진(또는 그레이스 없는 액션·유료 플랜).
// 조회 실패 시 0 — 배너를 띄우지 않는 쪽이 안전하다.
export async function getRemainingGrace(
  userId: string,
  plan: UserPlan | undefined,
  action: UsageAction
): Promise<number> {
  if (plan === "membership" || plan === "developer") return 0;
  const grace = FREE_GRACE[action];
  if (grace <= 0) return 0;

  const used = await countLifetimeUsage(userId, action);
  if (used === null) return 0;
  return Math.max(grace - used, 0);
}

// 생애 누적 사용 건수. 조회 실패 시 null.
async function countLifetimeUsage(userId: string, action: UsageAction): Promise<number | null> {
  const { count, error } = await supabase
    .from("usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action);

  if (error) return null;
  return count ?? 0;
}

export async function checkUsageLimit(
  userId: string,
  plan: UserPlan | undefined,
  action: UsageAction
): Promise<boolean> {
  if (plan === "membership" || plan === "developer") return true;

  // 그레이스 잔여분이 있으면 기간 한도를 보지 않는다 (서버와 동일한 규칙)
  const grace = FREE_GRACE[action];
  if (grace > 0) {
    const used = await countLifetimeUsage(userId, action);
    // 조회 실패 시 막지 않는다 — 서버가 최종 검증
    if (used === null) return true;
    if (used < grace) return true;
  }

  const rule = FREE_LIMITS[action];
  const since = periodStart(rule.period).toISOString();

  const { count, error } = await supabase
    .from("usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since);

  // 조회 실패 시 막지 않는다 — 서버가 최종 검증
  if (error) return true;
  return (count ?? 0) < rule.max;
}
