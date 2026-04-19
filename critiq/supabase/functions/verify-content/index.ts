import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MODEL = "gemini-2.5-flash-lite";

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
    const { title, category, language } = await req.json();

    const prompt = `너는 문화 콘텐츠 식별 전문가다.
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
}

제목: ${title}
카테고리: ${category}`;

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
          maxOutputTokens: 2048,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
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
    console.error("verify-content error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "작품을 검색하지 못했습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
