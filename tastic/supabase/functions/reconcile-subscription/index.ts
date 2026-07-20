import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 구독 정합화 — 클라이언트가 RevenueCat CustomerInfo 로 "활성 구독 없음(entitled:false)"
// 을 확정했을 때, DB users.plan 을 membership → free 로 내린다.
//
// 배경: iOS 는 App Store Server Notifications 연동이 없으면 EXPIRATION 웹훅이 오지
//       않아 plan 이 영영 membership 으로 남는다(앱스토어 심사 2.1 리젝). 앱이 스스로
//       스토어 상태를 확인해 만료를 반영하는 경로가 이 함수다.
//
// 보안:
//   - 대상 userId 는 body 가 아니라 Authorization 토큰에서 꺼낸다(본인만 정정).
//   - DOWNGRADE 전용이다. 자기 계정을 free 로 내리는 건 악용 유인이 없다.
//     업그레이드(free→membership)는 여기서 하지 않는다 — 웹훅이 검증된 소스다.
//   - developer(내부용)는 절대 변경하지 않는다(WHERE plan = 'membership').

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// 새 API 키 체계 프로젝트에선 SUPABASE_SERVICE_ROLE_KEY가 자동 주입되지 않을 수 있어 명시적 시크릿 우선.
const SERVICE_ROLE_KEY =
  Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "로그인이 필요합니다." }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "로그인이 필요합니다." }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as { entitled?: boolean };

    // 활성 구독이 확정적으로 없을 때(false)만 다운그레이드. 그 외(true/누락)는 무시.
    if (body.entitled !== false) {
      return new Response(
        JSON.stringify({ ok: true, plan: null, skipped: "not_downgrade" }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // membership 인 경우에만 free 로 내린다. developer 는 매칭 0건(보존), free 는 no-op.
    const { data: updated, error } = await admin
      .from("users")
      .update({ plan: "free" })
      .eq("id", userId)
      .eq("plan", "membership")
      .select("plan")
      .maybeSingle();

    if (error) {
      console.error("reconcile-subscription update error:", error);
      return new Response(
        JSON.stringify({ error: "update_failed", message: "구독 동기화에 실패했습니다." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // updated 가 null 이면 이미 free/developer(변경 없음). 다운그레이드했다면 'free'.
    const plan = updated?.plan ?? null;
    return new Response(JSON.stringify({ ok: true, plan }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reconcile-subscription error:", e);
    return new Response(
      JSON.stringify({ error: "bad_request", message: "구독 동기화에 실패했습니다." }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
