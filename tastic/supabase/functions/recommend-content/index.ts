import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceUsageLimit } from "../_shared/usage.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callOpenAI(prompt: string, _temperature = 0.5, maxTokens = 2048) {
  // 로컬 E2E용 mock — MOCK_LLM=true일 때만 동작 (배포 환경엔 미설정)
  if (Deno.env.get("MOCK_LLM") === "true") {
    return {
      recommendations: [
        { title: "[mock] 추천작", category: "movie", creator: "mock", year: 2024, reason: "mock", reason_short: "mock" },
      ],
    };
  }
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      tools: [{ type: "web_search_preview" }],
      input: prompt,
      max_output_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "OpenAI error");
  const message = data.output?.find((o: { type: string }) => o.type === "message");
  if (!message) throw new Error("No message in response");
  const raw = message.content[0].text as string;
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  return JSON.parse(jsonMatch ? jsonMatch[1] : raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { taste_profile, user_prompt, review_history, language } = await req.json();

    // free 플랜은 추천 하루 1회 (membership 무제한)
    const gate = await enforceUsageLimit(req, "recommendation", { language, cors: CORS });
    if (!gate.ok) return gate.response;

    const historyText = review_history
      .map((r: { content_title: string; category: string }) => `- [${r.category}] ${r.content_title}`)
      .join("\n");

    const prompt = `너는 문화 콘텐츠 큐레이터다. 사용자의 취향 프로파일과 요청을 바탕으로 콘텐츠를 추천하라.

## 추천 원칙

1. 크로스 카테고리: 사용자가 특정 카테고리를 요청하지 않았다면, 카테고리 경계를 넘는 추천을 포함하라.
2. 추천 이유 필수: 사용자의 취향 프로파일과 어떻게 연결되는지 1~2문장으로 설명.
3. 다양성: 같은 작가/감독의 작품을 2개 이상 추천하지 않는다.
4. 중복 제거: review_history에 있는 작품은 추천하지 않는다.
5. 실존 작품: 실제 존재하는 작품만 추천.

## 추천 수
- 3~5개

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "recommendations": [
    {
      "title": "string",
      "category": "movie | music | book | art",
      "creator": "string",
      "year": number | null,
      "reason": "string (1~2문장, 상세)",
      "reason_short": "string (1줄 요약)"
    }
  ]
}

취향 프로파일:
${taste_profile.join("\n")}

사용자 요청: ${user_prompt}

이미 감상한 작품:
${historyText}`;

    let parsed: unknown;
    try {
      parsed = await callOpenAI(prompt, 0.5);
    } catch (e) {
      await gate.release(); // 실패 시 예약한 사용량 롤백
      throw e;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("recommend-content error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "추천을 생성하지 못했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
