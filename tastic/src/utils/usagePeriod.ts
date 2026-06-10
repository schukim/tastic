// 멤버십 사용량 제한의 기간 경계 계산 (KST 기준, 주는 월요일 시작)
// supabase/functions/_shared/usage.ts의 서버 로직과 동일해야 함

export type UsagePeriod = "day" | "week";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function periodStart(period: UsagePeriod, now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  if (period === "week") {
    const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
    kst.setUTCDate(kst.getUTCDate() - daysSinceMonday);
  }
  return new Date(kst.getTime() - KST_OFFSET_MS);
}
