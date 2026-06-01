import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callOpenAI(
  prompt: string,
  _temperature = 0.1,
  maxTokens = 2048,
  allowedDomains?: string[],
) {
  // 화이트리스트가 있으면 web_search 툴의 도메인 필터로 검색 소스를 제한한다 (Phase 1).
  // 없으면 필터 없이 넓게 검색한다 (Phase 2 fallback).
  const tool = allowedDomains?.length
    ? { type: "web_search", filters: { allowed_domains: allowedDomains } }
    : { type: "web_search" };
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      tools: [tool],
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

// Phase 1 화이트리스트: 카테고리별 신뢰 소스. 프롬프트 유도(이름)와 도메인 필터(domain)에 함께 쓴다.
const SOURCE_WHITELIST: Record<string, { name: string; domain: string }[]> = {
  movie: [
    { name: "KMDb 한국영화DB", domain: "kmdb.or.kr" },
    { name: "TMDB", domain: "themoviedb.org" },
    { name: "IMDb", domain: "imdb.com" },
    { name: "왓챠피디아", domain: "pedia.watcha.com" },
    { name: "Letterboxd", domain: "letterboxd.com" },
    { name: "위키피디아", domain: "wikipedia.org" },
  ],
  series: [
    { name: "TMDB", domain: "themoviedb.org" },
    { name: "IMDb", domain: "imdb.com" },
    { name: "왓챠피디아", domain: "pedia.watcha.com" },
    { name: "위키피디아", domain: "wikipedia.org" },
  ],
  music: [
    { name: "멜론", domain: "melon.com" },
    { name: "벅스", domain: "bugs.co.kr" },
    { name: "MusicBrainz", domain: "musicbrainz.org" },
    { name: "Discogs", domain: "discogs.com" },
    { name: "AllMusic", domain: "allmusic.com" },
    { name: "위키피디아", domain: "wikipedia.org" },
  ],
  book: [
    { name: "교보문고", domain: "kyobobook.co.kr" },
    { name: "알라딘", domain: "aladin.co.kr" },
    { name: "예스24", domain: "yes24.com" },
    { name: "국립중앙도서관", domain: "nl.go.kr" },
    { name: "Google Books", domain: "books.google.com" },
    { name: "Goodreads", domain: "goodreads.com" },
  ],
  art: [
    { name: "위키피디아", domain: "wikipedia.org" },
    { name: "WikiArt", domain: "wikiart.org" },
    { name: "Google Arts & Culture", domain: "artsandculture.google.com" },
    { name: "국립현대미술관", domain: "mmca.go.kr" },
    { name: "The Met", domain: "metmuseum.org" },
  ],
};

function buildSourceList(category: string): string {
  return (SOURCE_WHITELIST[category] ?? [])
    .map((s) => `- ${s.name} (${s.domain})`)
    .join("\n");
}

function buildMetadataSchema(category: string): string {
  switch (category) {
    case "movie":
      return `metadata 필드 구조 (영화):
{
  "creator_style": "감독 고유의 연출 방식 — 편집 리듬, 카메라 무브먼트, 장면 구성, 색채 등 구체적으로 서술. 장르명 단독 사용 금지 (string | null)",
  "cast": ["주요 배우 이름 배열, 최대 5명"],
  "synopsis": "한 줄 시놉시스 (string | null)",
  "keywords": ["이 영화만의 감정적 분위기·주제의식·서사 특성 키워드. 제목·감독명·배우명·장르명은 절대 포함하지 말 것. 최소 1개 이상 (예: '냉소적 유머', '비선형 구조', '계급 갈등')"]
}`;
    case "music":
      return `metadata 필드 구조 (음악 — 앨범/곡 구분 필수):
앨범인 경우:
{
  "music_type": "album",
  "creator_style": "아티스트 고유의 음악적 접근 방식 — 제작 방식, 사운드 질감, 보컬 스타일, 가사 서사 등을 구체적으로 서술. 장르명 단독 사용 금지 (string | null)",
  "track_count": number | null,
  "keywords": ["이 앨범만의 감정적 분위기·소닉 특성·주제의식 키워드. 아티스트명·앨범명·장르명은 절대 포함하지 말 것. 최소 1개 이상 (예: '새벽 감성', '레이어드 사운드', '자기 성찰')"]
}
곡인 경우:
{
  "music_type": "song",
  "creator_style": "아티스트 고유의 음악적 접근 방식 — 제작 방식, 사운드 질감, 보컬 스타일, 가사 서사 등을 구체적으로 서술. 장르명 단독 사용 금지 (string | null)",
  "release_format": "앨범 수록 또는 싱글 (string | null)",
  "keywords": ["이 곡만의 감정적 분위기·소닉 특성·주제의식 키워드. 아티스트명·곡명·장르명은 절대 포함하지 말 것. 최소 1개 이상 (예: '이별 직후의 공허함', '몽환적 베이스라인', '반복 후렴')"]
}
※ 사용자가 명시하지 않으면 music_type은 "album"으로 기본 설정`;
    case "book":
      return `metadata 필드 구조 (책 — 소설/비소설 구분 필수):
소설 · 스토리인 경우:
{
  "book_type": "fiction",
  "creator_style": "저자 고유의 문체 특성 — 문장 길이·밀도, 감정 처리 방식, 서술 거리 등을 구체적으로 서술. 장르명 단독 사용 금지 (string | null)",
  "setting": "배경 (시대 + 장소) (string | null)",
  "perspective": "시점 (1인칭, 3인칭 등) (string | null)",
  "keywords": ["이 소설만의 감정적 분위기·서사 특성·주제의식 키워드. 제목·저자명·장르명은 절대 포함하지 말 것. 최소 1개 이상 (예: '실존적 불안', '섬세한 심리묘사', '느린 전개')"]
}
비소설 · 자기계발 · 이론 · 에세이인 경우:
{
  "book_type": "nonfiction",
  "creator_style": "저자 고유의 서술 방식 — 논증 구조, 예시 활용 방식, 독자 호명 스타일 등을 구체적으로 서술. 분야명 단독 사용 금지 (string | null)",
  "field": "분야 (심리학, 경제, 철학 등) (string | null)",
  "core_argument": "핵심 주장/논지 한 줄 (string | null)",
  "keywords": ["이 책만의 핵심 개념·주제 키워드. 제목·저자명·분야명은 절대 포함하지 말 것. 최소 1개 이상 (예: '습관 루프', '작은 행동의 복리', '정체성 기반 변화')"]
}`;
    case "art":
      return `metadata 필드 구조 (미술):
{
  "creator_style": "작가 고유의 조형 언어 — 색채 사용, 구성 방식, 붓질·질감, 표현 특성 등을 구체적으로 서술. 사조명 단독 사용 금지 (string | null)",
  "medium": "매체/기법 (유화, 설치미술, 사진 등) (string | null)",
  "movement": "예술 사조 (인상주의, 팝아트 등) (string | null)",
  "keywords": ["이 작품만의 감정적 분위기·시각적 특성·주제의식 키워드. 작품명·작가명·사조명은 절대 포함하지 말 것. 최소 1개 이상 (예: '멜랑꼴리', '왜곡된 원근법', '소비사회 비판')"]
}`;
    case "series":
      return `metadata 필드 구조 (시리즈/드라마):
{
  "creator_style": "감독/크리에이터 고유의 연출 방식 — 편집 리듬, 장면 구성, 캐릭터 서사 전개 방식 등을 구체적으로 서술. 장르명 단독 사용 금지 (string | null)",
  "cast": ["주요 배우 이름 배열, 최대 5명"],
  "synopsis": "한 줄 시놉시스 (string | null)",
  "keywords": ["이 시리즈만의 감정적 분위기·서사 특성·주제의식 키워드. 제목·감독명·배우명·장르명은 절대 포함하지 말 것. 최소 1개 이상 (예: '긴장된 침묵', '가족 내 권력 구도', '느린 빌드업')"]
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

    const sourceList = buildSourceList(category);
    const sourceBlock = sourceList
      ? `\n반드시 web_search로 아래 "우선 참조 소스"를 먼저 조회해 사실을 확인하라. 기억에만 의존하지 말 것.
창작자·발표 연도 등 핵심 정보는 가능하면 2개 이상의 소스에서 교차 확인하라.

우선 참조 소스 (${category}):
${sourceList}
`
      : "";

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
${sourceBlock}
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

    // Phase 1: 화이트리스트 도메인으로 제한해 정확도 우선 탐색
    const allowedDomains = (SOURCE_WHITELIST[category] ?? []).map((s) => s.domain);
    let parsed = await callOpenAI(prompt, 0.1, 2048, allowedDomains.length ? allowedDomains : undefined);

    // Phase 2: Phase 1이 빈 결과면 필터를 풀고 넓게 재탐색 (프롬프트 소스 유도는 유지)
    if (allowedDomains.length && !parsed?.candidates?.length) {
      parsed = await callOpenAI(prompt, 0.1, 2048);
    }

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
