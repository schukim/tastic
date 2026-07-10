import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceUsageLimit, adminClient } from "../_shared/usage.ts";
import { callJsonLLM } from "../_shared/llm.ts";

// 취향 분석 최소 평론 수 — 클라이언트 게이트와 동일하게 서버에서도 강제.
const MIN_REVIEWS = 3;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callLLM(prompt: string, temperature = 0.2, maxTokens = 1024) {
  // 로컬 E2E용 mock — MOCK_LLM=true일 때만 동작 (배포 환경엔 미설정)
  if (Deno.env.get("MOCK_LLM") === "true") {
    return { profile_sentences: ["[mock] 취향 문장"], recommendation_hook: "[mock] 훅" };
  }
  // 클라이언트 타임아웃 30초 — 콜드스타트·전송 여유를 남기고 25초
  return callJsonLLM(prompt, { temperature, maxTokens, timeoutMs: 25_000 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    // 언어만 클라이언트에서 받는다. 분석 대상 평론·이전 프로파일은 서버가 DB에서
    // 본인 데이터로 직접 조회한다(클라이언트가 보낸 임의 데이터 신뢰 금지).
    const { language } = await req.json();

    // free 플랜은 취향 분석 주 1회 (membership 무제한)
    const gate = await enforceUsageLimit(req, "analysis", { language, cors: CORS });
    if (!gate.ok) return gate.response;

    let parsed: unknown;
    try {
      // 본인 평론을 DB에서 조회 (works 조인). 예약 이후 전 구간을 try로 감싸 실패 시 롤백.
      const { data: reviewRows, error: rErr } = await adminClient()
        .from("reviews")
        .select("body, works(title, category)")
        .eq("user_id", gate.userId)
        .order("created_at", { ascending: false });
      if (rErr) throw new Error(`reviews fetch failed: ${rErr.message}`);

      const rows = (reviewRows ?? []) as { body: string; works: { title: string; category: string } | null }[];
      // 서버에서 본인 평론 수를 실제 확인 — 3편 미만이면 예약 롤백 후 거절
      if (rows.length < MIN_REVIEWS) {
        await gate.release();
        return new Response(
          JSON.stringify({
            error: "not_enough_reviews",
            message: language === "en" ? "You need at least 3 reviews." : "평론이 3편 이상 필요해요.",
          }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      const reviewsText = rows
        .map((r) => `[${r.works?.category ?? ""}] ${r.works?.title ?? ""}\n${r.body}`)
        .join("\n\n---\n\n");

      // 이전 취향 프로파일도 DB에서 조회 (변화 감지용)
      const { data: tp } = await adminClient()
        .from("taste_profiles")
        .select("profile_sentences")
        .eq("user_id", gate.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousProfile =
        tp?.profile_sentences && tp.profile_sentences.length > 0 ? tp.profile_sentences.join("\n") : "없음";

      const prompt = `너는 문화 취향 분석가다. 사용자가 작성한 평론들을 읽고, 그 사람의 감상 패턴과 취향을 정성적으로 분석하라.

## 분석 원칙

1. 서술형 문장: "· 해체된 구조와 서사를 통해 표현의 새로운 가능성을 탐색합니다."와 같은 형태. 키워드 태그나 수치 나열 금지.
2. 근거 기반: 실제 평론에서 드러난 패턴만 언급. 추측하지 않는다.
3. 크로스 카테고리 통찰: 영화와 음악에서 공통적으로 드러나는 성향 등을 연결.
4. 구체적 표현: "다양한 장르를 좋아합니다" 같은 모호한 문장 금지. 어떤 측면에서 어떤 경향이 있는지 구체적으로.
5. 변화 감지: previous_profile이 있으면 이전 분석과 비교하여 변화된 부분을 반영.

## 출력 구조

- profile_sentences: 5~8개의 불릿 문장 (각 30자 내외)
- recommendation_hook: 취향 기반 추천 유도 문구 1개

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "profile_sentences": ["string", ...],
  "recommendation_hook": "string"
}

평론 목록:
${reviewsText}

이전 분석 결과: ${previousProfile}`;

      parsed = await callLLM(prompt, 0.2);
    } catch (e) {
      await gate.release(); // 예약 이후 어떤 실패(입력·조회·LLM)든 사용량 롤백
      throw e;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-taste error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "취향 분석에 실패했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
