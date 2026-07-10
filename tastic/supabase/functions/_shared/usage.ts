import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ── 멤버십 플랜별 사용량 제한 (서버사이드 검증) ──
// free: 평론 하루 1회, 추천 하루 1회, 분석 주 1회 / membership: 무제한
// developer: 모든 제한 미적용 (DB에서 직접 부여하는 내부용, UI 비노출)
// 하루/주 경계는 KST(Asia/Seoul) 기준, 주는 월요일 시작.

export type GatedAction = "review" | "analysis" | "recommendation";
export type UserPlan = "free" | "membership" | "developer";

interface LimitRule {
  max: number;
  period: "day" | "week";
}

const FREE_LIMITS: Record<GatedAction, LimitRule> = {
  review: { max: 1, period: "day" },
  recommendation: { max: 1, period: "day" },
  analysis: { max: 1, period: "week" },
};

// 비공개 hard limit: free·membership 공통 액션별 하루 20회 (KST 자정 초기화).
// 초과 응답은 일반 한도 초과와 동일 문구 — 존재를 사용자에게 노출하지 않는다.
const HARD_LIMIT_PER_DAY = 20;

const LIMIT_MESSAGES: Record<GatedAction, { ko: string; en: string }> = {
  review: {
    ko: "무료 플랜은 평론을 하루에 1편 작성할 수 있어요. 내일 다시 만나요!",
    en: "The free plan allows 1 review per day. See you tomorrow!",
  },
  analysis: {
    ko: "무료 플랜은 취향 분석을 주 1회 이용할 수 있어요.",
    en: "The free plan allows 1 taste analysis per week.",
  },
  recommendation: {
    ko: "무료 플랜은 추천을 하루에 1회 받을 수 있어요.",
    en: "The free plan allows 1 recommendation per day.",
  },
};

const MEMBERSHIP_ONLY_MESSAGE = {
  ko: "평론 미리보기는 멤버십 전용 기능이에요.",
  en: "Review preview is a membership-only feature.",
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function periodStart(period: "day" | "week", now = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  if (period === "week") {
    const daysSinceMonday = (kst.getUTCDay() + 6) % 7;
    kst.setUTCDate(kst.getUTCDate() - daysSinceMonday);
  }
  return new Date(kst.getTime() - KST_OFFSET_MS);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
// 새 API 키 체계 프로젝트에선 SUPABASE_SERVICE_ROLE_KEY가 자동 주입되지 않을 수 있어 명시적 시크릿 우선.
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface EnforceOptions {
  // 같은 인터뷰의 평론 재생성을 중복 카운트하지 않기 위한 참조 id
  refId?: string | null;
  // true면 플랜 무관 검사 없이 멤버십만 요구 (예: 평론 미리보기)
  requireMembership?: boolean;
  // false면 사용량을 소비/기록하지 않는다 (예: 평론 미리보기 — 멤버십 확인만)
  count?: boolean;
  language?: "ko" | "en";
  cors: Record<string, string>;
}

type EnforceResult =
  | {
      ok: true;
      userId: string;
      plan: UserPlan;
      // LLM 호출 실패 시 예약(사용량 카운트)을 되돌린다. 성공 경로에선 호출하지 않는다.
      release: () => Promise<void>;
    }
  | { ok: false; response: Response };

function errorResponse(
  status: number,
  error: string,
  message: string,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function enforceUsageLimit(
  req: Request,
  action: GatedAction,
  opts: EnforceOptions
): Promise<EnforceResult> {
  const lang = opts.language === "en" ? "en" : "ko";
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return {
      ok: false,
      response: errorResponse(401, "unauthorized", lang === "ko" ? "로그인이 필요합니다." : "Sign-in required.", opts.cors),
    };
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return {
      ok: false,
      response: errorResponse(401, "unauthorized", lang === "ko" ? "로그인이 필요합니다." : "Sign-in required.", opts.cors),
    };
  }
  const userId = userData.user.id;

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    return {
      ok: false,
      response: errorResponse(500, "usage_check_failed", lang === "ko" ? "사용량 확인에 실패했습니다." : "Failed to verify usage.", opts.cors),
    };
  }
  const plan: UserPlan =
    profile?.plan === "membership" || profile?.plan === "developer"
      ? profile.plan
      : "free";

  if (opts.requireMembership && plan === "free") {
    return {
      ok: false,
      response: errorResponse(403, "membership_required", MEMBERSHIP_ONLY_MESSAGE[lang], opts.cors),
    };
  }

  const usageCheckFailed = () =>
    errorResponse(
      500,
      "usage_check_failed",
      lang === "ko" ? "사용량 확인에 실패했습니다." : "Failed to verify usage.",
      opts.cors,
    );

  // count=false (예: 미리보기): 멤버십 확인만 하고 사용량은 소비하지 않는다.
  if (opts.count === false) {
    return { ok: true, userId, plan, release: async () => {} };
  }

  // 플랜별 검사 규칙 결정
  const rule = FREE_LIMITS[action];
  const checkPeriod = plan === "free";
  const checkHard = plan !== "developer"; // free·membership 공통 hard limit

  // ── 원자적 소비: count 확인 + insert 를 단일 RPC(tx-advisory-lock)로 처리 ──
  const { data, error } = await admin.rpc("consume_usage", {
    p_user_id: userId,
    p_action: action,
    p_ref_id: opts.refId ?? null,
    p_check_period: checkPeriod,
    p_period_start: periodStart(rule.period).toISOString(),
    p_period_limit: rule.max,
    p_check_hard: checkHard,
    p_day_start: periodStart("day").toISOString(),
    p_hard_limit: HARD_LIMIT_PER_DAY,
  });
  if (error) {
    console.error("consume_usage rpc failed:", error);
    return { ok: false, response: usageCheckFailed() };
  }

  const result = data as { allowed: boolean; counted?: boolean; id?: string | null };
  if (!result.allowed) {
    // hard limit·플랜 한도 모두 동일 문구 — hard limit 존재를 노출하지 않음
    return {
      ok: false,
      response: errorResponse(429, "limit_exceeded", LIMIT_MESSAGES[action][lang], opts.cors),
    };
  }

  // 새로 기록된 예약만 롤백 대상 (멱등 재기록·미소비는 no-op)
  const reservationId = result.counted ? result.id ?? null : null;
  const release = async () => {
    if (!reservationId) return;
    const { error: delError } = await admin.from("usage_logs").delete().eq("id", reservationId);
    if (delError) console.error("usage reservation release failed:", delError);
  };

  return { ok: true, userId, plan, release };
}
