// OpenAI 웹서치 공용 모듈 — verify-content / recommend-content 공유.
//
// 2단계 검증 패턴:
//   1) searchStep: GA web_search + allowed_domains 필터로 신뢰 소스만 조사(강제 제한)
//   2) formatStep: 툴 없이 strict json_schema로만 정형화 → 스키마 밖 토큰 생성 불가,
//      "못 찾음"은 구조적으로 빈 배열이 된다.
// gpt-4.1은 GA web_search + 도메인 필터를 지원한다 (gpt-4.1/nano, gpt-4o는 filters 미지원).

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
export const OPENAI_MODEL = "gpt-4.1";
export const OPENAI_URL = "https://api.openai.com/v1/responses";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── 카테고리별 신뢰 소스 ──
// domain은 web_search의 allowed_domains 필터(검색 강제 제한)에,
// name은 프롬프트 소스 목록 표기에 함께 쓴다.
export const SOURCE_WHITELIST: Record<string, { name: string; domain: string }[]> = {
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

export function buildSourceList(category: string): string {
  return (SOURCE_WHITELIST[category] ?? [])
    .map((s) => `- ${s.name} (${s.domain})`)
    .join("\n");
}

// 카테고리의 allowed_domains 목록 (web_search 필터용). 카테고리 미지정/전체면 전 도메인 합집합.
export function allowedDomainsFor(category: string | null | undefined): string[] {
  if (category && SOURCE_WHITELIST[category]) {
    return SOURCE_WHITELIST[category].map((s) => s.domain);
  }
  // 크로스 카테고리(카테고리 미지정) — 전 소스 도메인 합집합(중복 제거)
  const all = Object.values(SOURCE_WHITELIST).flatMap((list) => list.map((s) => s.domain));
  return [...new Set(all)];
}

// ── Structured Outputs 스키마 헬퍼 ──
// strict 모드 제약(모든 키 required + additionalProperties:false)을 지킨다.
export const STR_OR_NULL = { type: ["string", "null"] };
export const STR_ARRAY = { type: "array", items: { type: "string" } };

export function strictObject(props: Record<string, unknown>) {
  return {
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  };
}

// ── 탐색 트레이스 ──
// OpenAI Responses API의 output 배열에서 웹서치 과정/지표를 뽑아낸다.
// 응답에 _debug로 실어 검색 과정을 로그 분석하듯 추적한다.
// deno-lint-ignore no-explicit-any
export function buildTrace(data: any, ms: number, ok: boolean) {
  const output = Array.isArray(data?.output) ? data.output : [];
  // deno-lint-ignore no-explicit-any
  const searches = output.filter((o: any) => o.type === "web_search_call");
  return {
    ms,
    http_ok: ok,
    // 캐시 히트 여부 — 클라이언트가 '재검색' 버튼 노출 판단에 사용
    cache_hit: false,
    // OpenAI가 요청을 거부(non-2xx)했을 때의 실제 에러 본문 — 원인 추적용
    openai_error: ok ? null : (data?.error ?? data ?? null),
    status: data?.status ?? null,
    // 잘림 여부: "max_output_tokens"면 출력이 토큰 한도로 끊긴 것
    incomplete_reason: data?.incomplete_details?.reason ?? null,
    usage: data?.usage ?? null,
    search_count: searches.length,
    // deno-lint-ignore no-explicit-any
    searches: searches.map((s: any) => ({ status: s.status, action: s.action })),
    // deno-lint-ignore no-explicit-any
    output_types: output.map((o: any) => o.type),
    raw_text: null as string | null,
    // 모델이 실제 인용한 출처 URL/도메인. 우리가 준 소스를 실제로 봤는지 확인하는 직접 증거.
    cited_domains: [] as string[],
    citations: [] as { url: string; title: string | null }[],
    // 2단계(정형화) 호출 지표 — Structured Outputs로 JSON을 강제하는 단계
    format_status: null as string | null,
    format_incomplete: null as string | null,
  };
}

export type Trace = ReturnType<typeof buildTrace>;

// 에러에 트레이스를 실어 throw — catch 경로에서 _debug로 회수한다.
export function withTrace(e: Error, trace: unknown): Error {
  (e as Error & { trace?: unknown }).trace = trace;
  return e;
}

// 메시지 annotation에서 인용 URL을 뽑아 트레이스에 채운다.
// deno-lint-ignore no-explicit-any
export function extractCitations(message: any, trace: Trace) {
  // deno-lint-ignore no-explicit-any
  const annotations = (message?.content ?? []).flatMap((c: any) => c.annotations ?? []);
  const citations = annotations
    // deno-lint-ignore no-explicit-any
    .filter((a: any) => a.type === "url_citation" && a.url)
    // deno-lint-ignore no-explicit-any
    .map((a: any) => ({ url: a.url as string, title: a.title ?? null }));
  trace.citations = citations;
  trace.cited_domains = [
    ...new Set(
      citations.map((c: { url: string }) => {
        try {
          return new URL(c.url).hostname.replace(/^www\./, "");
        } catch {
          return c.url;
        }
      })
    ),
  ];
}

// deno-lint-ignore no-explicit-any
export function textOf(message: any): string | null {
  // deno-lint-ignore no-explicit-any
  const item = (message?.content ?? []).find((c: any) => typeof c.text === "string");
  return item?.text ?? null;
}

// ── 1단계: 탐색 ──
// GA web_search로 조사한다. allowed_domains 필터로 검색을 신뢰 소스(화이트리스트)로 강제 제한한다.
// temperature 0으로 변동성 최소화.
export async function searchStep(prompt: string, allowedDomains: string[]) {
  const t0 = Date.now();
  // 도메인이 있으면 그 도메인들로 검색을 제한(강제), 없으면 필터 없이 넓게 검색.
  const webSearch = allowedDomains.length
    ? { type: "web_search", filters: { allowed_domains: allowedDomains } }
    : { type: "web_search" };
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      tools: [webSearch],
      // 검색 강제 — 모델이 web_search를 건너뛰고 훈련지식으로 답하는 것을 차단(환각 방지의 핵심).
      tool_choice: "required",
      input: prompt,
      temperature: 0,
      max_output_tokens: 2048,
    }),
  });
  const data = await res.json();
  const trace = buildTrace(data, Date.now() - t0, res.ok);
  if (!res.ok) throw withTrace(new Error(data.error?.message ?? "OpenAI error (search)"), trace);
  const message = data.output?.find((o: { type: string }) => o.type === "message");
  const findings = textOf(message) ?? "";
  trace.raw_text = findings;
  if (message) extractCitations(message, trace);
  return { findings, trace };
}

// ── 2단계: 정형화 ──
// 툴 없이, Structured Outputs(strict json_schema)로만 호출한다.
// 디코더가 스키마 밖 토큰을 생성할 수 없으므로 산문 출력이 원천 불가능하고,
// "못 찾음"은 구조적으로 빈 배열이 된다.
export async function formatStep(prompt: string, schema: Record<string, unknown>, trace: Trace, schemaName = "content_candidates") {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0,
      max_output_tokens: 2048,
      text: {
        format: { type: "json_schema", name: schemaName, strict: true, schema },
      },
    }),
  });
  const data = await res.json();
  trace.format_status = data?.status ?? null;
  trace.format_incomplete = data?.incomplete_details?.reason ?? null;
  if (data?.incomplete_details?.reason) trace.incomplete_reason = data.incomplete_details.reason;
  if (!res.ok) throw withTrace(new Error(data.error?.message ?? "OpenAI error (format)"), trace);
  const message = data.output?.find((o: { type: string }) => o.type === "message");
  // deno-lint-ignore no-explicit-any
  const refusal = (message?.content ?? []).find((c: any) => c.type === "refusal");
  if (refusal) throw withTrace(new Error(`Model refused: ${refusal.refusal}`), trace);
  const raw = textOf(message);
  if (raw == null) throw withTrace(new Error("No text in format step"), trace);
  try {
    // strict 스키마 통과분이라 항상 유효 JSON
    return { parsed: JSON.parse(raw) };
  } catch (parseErr) {
    throw withTrace(new Error(`JSON parse failed (format): ${(parseErr as Error).message}`), trace);
  }
}
