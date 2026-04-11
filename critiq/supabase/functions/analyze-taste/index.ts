import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MODEL = "gemini-1.5-pro";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const { reviews, previous_profile, language } = await req.json();

    const reviewsText = reviews
      .map((r: { content_title: string; category: string; review_text: string }) =>
        `[${r.category}] ${r.content_title}\n${r.review_text}`
      )
      .join("\n\n---\n\n");

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

이전 분석 결과: ${previous_profile ?? "없음"}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.2,
        }
      }),
    });

    const result = await response.json();

    if (!result.candidates || result.candidates.length === 0) {
      throw new Error("No response from Gemini API");
    }

    const text = result.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-taste error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "취향 분석에 실패했습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
