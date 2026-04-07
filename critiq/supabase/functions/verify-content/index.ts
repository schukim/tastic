import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-20250514";

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
    // JWT 검증
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

    const { title, category, language } = await req.json();

    const systemPrompt = `너는 문화 콘텐츠 식별 전문가다.
사용자가 입력한 제목과 카테고리를 바탕으로 실제 존재하는 작품을 찾아라.

규칙:
- 동일 제목의 작품이 여러 개 있으면 최대 5개까지 후보를 반환
- 각 후보에 대해 카테고리별 메타데이터를 포함
- 확신할 수 없는 필드는 null로 반환 (추측 금지)
- 해당 작품을 찾을 수 없으면 빈 배열 반환
- ${language === "ko" ? "한국어" : "English"}로 응답

반드시 아래 JSON 형식으로만 응답하라:
{
  "candidates": [
    {
      "title": "string",
      "original_title": "string | null",
      "creator": "string | null",
      "year": number | null,
      "genre": "string | null",
      "metadata": {},
      "confidence": "high | medium | low"
    }
  ]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: "user", content: `제목: ${title}\n카테고리: ${category}` },
        ],
      }),
    });

    const result = await response.json();
    const text = result.content[0].text;

    // JSON 파싱 (```json 래핑 제거)
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-content error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "작품을 검색하지 못했습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
