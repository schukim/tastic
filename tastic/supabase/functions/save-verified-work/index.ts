import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 작품 확정(ContentConfirmScreen에서 후보 선택) 시 호출.
// verify-content(웹서치 또는 캐시)로 식별된 작품을 works에 is_verified=true로 저장/승격해
// 전역 캐시로 공유한다. is_verified는 클라이언트가 직접 못 세우므로(가드 트리거) 서버에서만 수행.
//
// 동작:
//   1. search_works로 동일/유사 작품(>=0.85) 탐색
//   2. 있으면 그 행을 재사용 + 미검증이면 검증 승격(메타데이터 보강)
//   3. 없으면 새 행을 is_verified=true로 생성
// 수동 입력(유저가 직접 타이핑)은 이 함수를 쓰지 않고 기존 client insert(is_verified=false) 유지.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// 새 API 키 체계 프로젝트에선 SUPABASE_SERVICE_ROLE_KEY가 자동 주입되지 않을 수 있어 명시적 시크릿 우선.
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REUSE_SIMILARITY_THRESHOLD = 0.85;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SaveWorkBody {
  userId: string;
  title: string;
  category: string;
  originalTitle?: string | null;
  creator?: string | null;
  year?: number | null;
  genre?: string | null;
  metadata?: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const body = (await req.json()) as SaveWorkBody;
    const { userId, title, category } = body;
    if (!userId || !title || !category) {
      return new Response(
        JSON.stringify({ error: "invalid_request", message: "userId/title/category 필수" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. 기존 작품 탐색
    // 임베딩 미전달 → 제목 trigram 유사도만으로 0~1 스케일이 되도록 가중치 조정
    // (기본 trigram 0.4 / embedding 0.6이면 점수가 최대 0.55로 묶여 0.85 재사용 판정 불가)
    const { data: matches, error: searchError } = await sb.rpc("search_works", {
      query_text: title,
      target_category: category,
      trigram_weight: 1.0,
      embedding_weight: 0.0,
      limit_count: 5,
    });
    if (searchError) console.error("save-verified-work search error:", searchError);

    const best = matches?.[0];
    if (best && best.similarity_score >= REUSE_SIMILARITY_THRESHOLD) {
      // 2. 재사용 + 검증 승격. 미검증 행이면 메타데이터를 우리 값으로 보강.
      const patch: Record<string, unknown> = {
        is_verified: true,
        verified_at: new Date().toISOString(),
      };
      if (!best.is_verified) {
        if (best.primary_source == null) patch.primary_source = "llm_verified";
        if (body.originalTitle != null) patch.original_title = body.originalTitle;
        if (body.creator != null) patch.creator = body.creator;
        if (body.year != null) patch.year = body.year;
        if (body.genre != null) patch.genre = body.genre;
        if (body.metadata && Object.keys(body.metadata).length > 0) patch.metadata = body.metadata;
      }
      const { data: updated, error: updErr } = await sb
        .from("works")
        .update(patch)
        .eq("id", best.id)
        .select()
        .single();
      if (updErr) {
        console.error("save-verified-work promote error:", updErr);
        throw new Error(updErr.message);
      }
      return new Response(JSON.stringify({ work: updated, reused: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. 신규 생성 (검증 캐시로)
    const { data: created, error: insErr } = await sb
      .from("works")
      .insert({
        user_id: userId,
        title,
        original_title: body.originalTitle ?? null,
        category,
        creator: body.creator ?? null,
        year: body.year ?? null,
        genre: body.genre ?? null,
        metadata: body.metadata ?? {},
        is_verified: true,
        verified_at: new Date().toISOString(),
        primary_source: "llm_verified",
      })
      .select()
      .single();
    if (insErr) {
      console.error("save-verified-work insert error:", insErr);
      throw new Error(insErr.message);
    }
    return new Response(JSON.stringify({ work: created, reused: false }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("save-verified-work error:", error);
    return new Response(
      JSON.stringify({ error: "save_failed", message: "작품 저장에 실패했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
