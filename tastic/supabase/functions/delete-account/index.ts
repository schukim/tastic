import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 회원탈퇴. 클라이언트는 RLS 때문에 users row 를 지울 수 없고,
// auth.users 계정 삭제는 service role 로만 가능하므로 서버에서 수행한다.
// auth.users 삭제 → public.users (on delete cascade) → reviews/interviews/
// taste_profiles/recommendations/usage_logs 까지 연쇄 삭제된다.
// 대상 userId 는 body 가 아닌 Authorization 토큰에서 꺼낸다 — 본인 계정만 삭제 가능.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// 새 API 키 체계 프로젝트에선 SUPABASE_SERVICE_ROLE_KEY가 자동 주입되지 않을 수 있어 명시적 시크릿 우선.
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
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

    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      console.error("delete-account failed:", deleteError);
      return new Response(
        JSON.stringify({ error: "delete_failed", message: "계정 삭제에 실패했습니다." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("delete-account error:", error);
    return new Response(
      JSON.stringify({ error: "delete_failed", message: "계정 삭제에 실패했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
