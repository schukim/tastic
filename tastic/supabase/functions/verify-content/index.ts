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

function buildMetadataSchema(category: string): string {
  switch (category) {
    case "movie":
      return `metadata 필드 구조 (영화):
{
  "creator_style": "감독의 대표 연출 스타일 (string | null)",
  "cast": ["주요 배우 이름 배열, 최대 5명"],
  "synopsis": "한 줄 시놉시스 (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}`;
    case "music":
      return `metadata 필드 구조 (음악 — 앨범/곡 구분 필수):
앨범인 경우:
{
  "music_type": "album",
  "creator_style": "아티스트의 대표 음악 스타일 (string | null)",
  "track_count": number | null,
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}
곡인 경우:
{
  "music_type": "song",
  "creator_style": "아티스트의 대표 음악 스타일 (string | null)",
  "release_format": "앨범 수록 또는 싱글 (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}
※ 사용자가 명시하지 않으면 music_type은 "album"으로 기본 설정`;
    case "book":
      return `metadata 필드 구조 (책 — 소설/비소설 구분 필수):
소설 · 스토리인 경우:
{
  "book_type": "fiction",
  "creator_style": "저자의 대표 문체/스타일 (string | null)",
  "setting": "배경 (시대 + 장소) (string | null)",
  "perspective": "시점 (1인칭, 3인칭 등) (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}
비소설 · 자기계발 · 이론 · 에세이인 경우:
{
  "book_type": "nonfiction",
  "creator_style": "저자의 대표 문체/스타일 (string | null)",
  "field": "분야 (심리학, 경제, 철학 등) (string | null)",
  "core_argument": "핵심 주장/논지 한 줄 (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}`;
    case "art":
      return `metadata 필드 구조 (미술):
{
  "creator_style": "작가의 대표 스타일 (string | null)",
  "medium": "매체/기법 (유화, 설치미술, 사진 등) (string | null)",
  "movement": "예술 사조 (인상주의, 팝아트 등) (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}`;
    case "series":
      return `metadata 필드 구조 (시리즈/드라마):
{
  "cast": ["주요 배우 이름 배열, 최대 5명"],
  "synopsis": "한 줄 시놉시스 (string | null)",
  "keywords": ["작품 관련 주요 키워드, 최소 1개 이상"]
}
※ 창작자(감독/크리에이터), 장르, 발표 연도는 별도 필드로 저장하므로 metadata에 포함하지 말 것`;
    default:
      return `metadata 필드 구조:\n{}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { title, creator, category, language } = await req.json();

    const creatorLine = creator ? `창작자 힌트: ${creator}\n` : "";

    const metadataSchema = buildMetadataSchema(category);

    const prompt = `너는 문화 콘텐츠 식별 전문가다.
사용자가 입력한 정보를 바탕으로 실제 존재하는 작품을 찾아라.

규칙:
- 창작자 힌트가 있으면 해당 창작자의 작품을 우선 탐색
- 동일 제목의 작품이 여러 개 있으면 최대 5개까지 후보를 반환
- 각 후보에 대해 아래 카테고리별 metadata 구조를 반드시 채울 것
- keywords는 최소 1개 이상 반드시 포함
- 확신할 수 없는 필드는 null로 반환 (추측 금지)
- 해당 작품을 찾을 수 없으면 빈 배열 반환
- ${language === "ko" ? "한국어" : "English"}로 응답

${metadataSchema}

반드시 아래 JSON 형식으로만 응답하라:
{
  "candidates": [
    {
      "title": "string",
      "original_title": "string | null",
      "creator": "string | null",
      "year": number | null,
      "genre": "string | null",
      "metadata": { /* 위 카테고리별 구조 그대로 */ },
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
