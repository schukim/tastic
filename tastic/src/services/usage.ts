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

export async function checkUsageLimit(
  userId: string,
  plan: UserPlan | undefined,
  action: UsageAction
): Promise<boolean> {
  if (plan === "membership" || plan === "developer") return true;

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
