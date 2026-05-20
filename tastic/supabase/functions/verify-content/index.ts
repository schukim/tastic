import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callOpenAI(prompt: string, _temperature = 0.1, maxTokens = 2048) {
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
    const { title, creator, category, language } = await req.json();

    const creatorLine = creator ? `창작자 힌트: ${creator}\n` : "";

    const prompt = `너는 문화 콘텐츠 식별 전문가다.
사용자가 입력한 정보를 바탕으로 실제 존재하는 작품을 찾아라.

규칙:
- 창작자 힌트가 있으면 해당 창작자의 작품을 우선 탐색
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
카테고리: ${category}
${creatorLine}`;

    const parsed = await callOpenAI(prompt, 0.1);

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-content error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "작품을 검색하지 못했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
