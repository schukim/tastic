import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// RevenueCat 웹훅 — 구독 상태 변화를 users.plan에 동기화한다 (플랜의 source of truth).
//
// 인증: RevenueCat 대시보드(Project settings → Integrations → Webhooks)에서 설정한
//       Authorization 헤더 값을 REVENUECAT_WEBHOOK_SECRET 시크릿과 비교한다.
//
// app_user_id: 클라이언트가 Purchases.logIn(supabase user.id)로 맞추므로 Supabase user.id와 일치.
//
// developer 플랜(내부용)은 절대 변경하지 않는다 (.neq("plan","developer")).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

// 멤버십 접근을 부여/유지하는 이벤트
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
]);
// 접근이 실제로 종료되는 이벤트 (CANCELLATION은 자동갱신 해제일 뿐 만료 전까지 유지 → 제외)
const REVOKE_EVENTS = new Set(["EXPIRATION"]);

interface RCEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  // TRANSFER 이벤트 전용 — 영수증이 이전된 출발/도착 app_user_id 목록
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

// $RCAnonymousID:... 는 Supabase user.id와 매칭되지 않으므로 걸러낸다
function realUserIds(ids: string[] | null | undefined): string[] {
  return (ids ?? []).filter((id) => id && !id.startsWith("$RCAnonymousID:"));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  // 1. 웹훅 인증
  const auth = req.headers.get("Authorization") ?? "";
  if (!WEBHOOK_SECRET || auth !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as { event?: RCEvent };
    const event = body.event;
    const type = event?.type;
    if (!event || !type) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_event" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // TRANSFER — 영수증(구독)이 다른 앱 계정으로 이전됨.
    // 두 번째 기기에서 같은 스토어 계정으로 재구매/복원할 때 발생한다.
    // 이걸 무시하면 이전받은 계정의 plan이 영영 안 올라간다 (앱스토어 심사 리젝 사례).
    if (type === "TRANSFER") {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const toIds = realUserIds(event.transferred_to);
      const fromIds = realUserIds(event.transferred_from);
      if (toIds.length > 0) {
        const { error } = await admin
          .from("users")
          .update({ plan: "membership" })
          .in("id", toIds)
          .neq("plan", "developer");
        if (error) {
          console.error("revenuecat-webhook transfer grant error:", error);
          return new Response(JSON.stringify({ error: "update_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      if (fromIds.length > 0) {
        const { error } = await admin
          .from("users")
          .update({ plan: "free" })
          .in("id", fromIds)
          .neq("plan", "developer");
        if (error) {
          console.error("revenuecat-webhook transfer revoke error:", error);
          return new Response(JSON.stringify({ error: "update_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response(
        JSON.stringify({ ok: true, type, to: toIds.length, from: fromIds.length }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const grant = GRANT_EVENTS.has(type);
    const revoke = REVOKE_EVENTS.has(type);
    // 그 외 이벤트(TEST, CANCELLATION, BILLING_ISSUE 등)는 무시
    if (!grant && !revoke) {
      return new Response(JSON.stringify({ ok: true, skipped: type }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const appUserId = event.app_user_id ?? event.original_app_user_id;
    if (!appUserId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_app_user_id" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const nextPlan = grant ? "membership" : "free";

    // developer는 보존. 익명 RevenueCat id(앱 user.id와 다름)면 매칭 0건 — 정상.
    const { error } = await admin
      .from("users")
      .update({ plan: nextPlan })
      .eq("id", appUserId)
      .neq("plan", "developer");
    if (error) {
      console.error("revenuecat-webhook update error:", error);
      return new Response(JSON.stringify({ error: "update_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, type, plan: nextPlan }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("revenuecat-webhook error:", e);
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
