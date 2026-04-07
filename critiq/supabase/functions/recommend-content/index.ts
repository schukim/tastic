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

    const { taste_profile, user_prompt, review_history, language } = await req.json();

    const systemPrompt = `너는 문화 콘텐츠 큐레이터다. 사용자의 취향 프로파일과 요청을 바탕으로 콘텐츠를 추천하라.

## 추천 원칙

1. 크로스 카테고리: 사용자가 특정 카테고리를 요청하지 않았다면, 카테고리 경계를 넘는 추천을 포함하라 (예: 영화 취향 기반 → 책 추천).
2. 추천 이유 필수: 사용자의 취향 프로파일과 어떻게 연결되는지 1~2문장으로 설명.
3. 다양성: 같은 작가/감독의 작품을 2개 이상 추천하지 않는다.
4. 중복 제거: review_history에 있는 작품은 추천하지 않는다.
5. 실존 작품: 실제 존재하는 작품만 추천. 확신할 수 없으면 추천하지 않는다.

## 추천 수
- 3~5개

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "recommendations": [
    {
      "title": "string",
      "category": "movie | music | book | art | exhibition | performance",
      "creator": "string",
      "year": number | null,
      "reason": "string (1~2문장, 상세)",
      "reason_short": "string (1줄 요약)"
    }
  ]
}`;

    const historyText = review_history
      .map((r: { content_title: string; category: string }) => `- [${r.category}] ${r.content_title}`)
      .join("\n");

    const userMessage = `취향 프로파일:\n${taste_profile.join("\n")}\n\n사용자 요청: ${user_prompt}\n\n이미 감상한 작품:\n${historyText}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const result = await response.json();
    const text = result.content[0].text;
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("recommend-content error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "추천을 생성하지 못했습니다." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
