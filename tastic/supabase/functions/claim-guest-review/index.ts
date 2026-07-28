import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, authenticateUser, periodStart } from "../_shared/usage.ts";

// 게스트 체험으로 만든 평론을 로그인 계정으로 이전할 때, 그 계정의 오늘치 무료 사용량을
// 1회 소진시킨다.
//
// 왜 필요한가: 게스트 1회와 로그인 후 무료 1회를 따로 두면 "게스트로 1편 + 로그인 후 1편
// = 하루 2편" 우회가 된다. 게스트가 만든 평론도 결국 계정에 귀속되므로 그 계정의
// 오늘 무료 1편을 쓴 것으로 기록한다.
//
// usage_logs 는 service-role 쓰기 전용(RLS)이라 클라이언트가 직접 기록할 수 없어 이 함수를 둔다.
// ref_id 로 평론 id 를 넘겨 (user_id, action, ref_id) 유니크 인덱스에 기대 재시도해도
// 중복 카운트되지 않게 한다.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { review_id, language } = await req.json();
    const lang = language === "en" ? "en" : "ko";

    const auth = await authenticateUser(req, CORS, lang);
    if (!auth.ok) return auth.response;

    if (typeof review_id !== "string" || !review_id) {
      return json(400, {
        error: "invalid_request",
        message: lang === "ko" ? "잘못된 요청입니다." : "Invalid request.",
      });
    }

    // 본인 소유 평론만 인정 — 타인/임의 uuid 로 남의 사용량을 태우지 못하게 한다.
    const { data: review } = await adminClient()
      .from("reviews")
      .select("id")
      .eq("id", review_id)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (!review) {
      return json(404, {
        error: "not_found",
        message: lang === "ko" ? "평론을 찾을 수 없습니다." : "Review not found.",
      });
    }

    // 검사 없이 기록만 한다(p_check_period/p_check_hard=false) — 이전은 막지 않고
    // "오늘 무료 1편을 썼다"는 사실만 남기는 것이 목적이다.
    const { error } = await adminClient().rpc("consume_usage", {
      p_user_id: auth.userId,
      p_action: "review",
      p_ref_id: review_id,
      p_check_period: false,
      p_period_start: periodStart("day").toISOString(),
      p_period_limit: 0,
      p_check_hard: false,
      p_day_start: periodStart("day").toISOString(),
      p_hard_limit: 0,
    });

    if (error) {
      console.error("claim-guest-review consume_usage failed:", error);
      return json(500, {
        error: "usage_record_failed",
        message: lang === "ko" ? "사용량 기록에 실패했습니다." : "Failed to record usage.",
      });
    }

    return json(200, { claimed: true });
  } catch (error) {
    console.error("claim-guest-review error:", error);
    return json(500, { error: "internal_error", message: "Internal error" });
  }
});
