import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/usage.ts";

// 유저별 작품 검색 일일 상한(비용 남용 방어). 정상 사용자는 하루 수 건, 이 값은 abuse ceiling.
const SEARCH_RATE_LIMIT_PER_DAY = 40;

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4.1";

// 글로벌 콘텐츠 캐시: 동일/유사 작품을 다른 유저가 검색하면 웹서치를 스킵하고
// 기존 신뢰 작품(works.is_verified=true 또는 외부 ingestion)의 메타데이터를 재사용한다.
// service_role로 RLS를 우회해 전체 카탈로그를 조회한다.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// 새 API 키 체계 프로젝트에선 SUPABASE_SERVICE_ROLE_KEY가 함수 env에 자동 주입되지 않을 수 있어,
// 명시적 시크릿 SB_SERVICE_ROLE_KEY를 우선 사용하고 없으면 자동 주입분으로 폴백한다.
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// 임계값 0.85: 근접 매칭으로 false positive가 생길 수 있으나, 캐시 히트 시 클라이언트가
// '재검색'(skipCache=true) 버튼으로 웹서치를 강제할 수 있어 안전망이 된다.
const CACHE_SIMILARITY_THRESHOLD = 0.85;

// deno-lint-ignore no-explicit-any
let _sb: any = null;
function supabase() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return _sb;
}

// search_works RPC로 카탈로그를 훑어, 신뢰할 수 있는 캐시 작품이 있으면 candidate로 합성해 반환.
// 없으면 null → 호출부에서 웹서치로 폴백.
async function lookupCache(title: string, category: string) {
  // 캐시 조회는 절대 함수를 죽이면 안 된다 — 어떤 실패(키 누락·RPC 에러·지연)든 null 반환 후 웹서치로 폴백.
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("lookupCache: service-role env 누락 — 캐시 비활성, 웹서치로 폴백");
      return null;
    }
    // 임베딩을 넘기지 않으므로 제목 trigram 유사도만으로 0~1 스케일이 되도록 가중치를 조정한다.
    // (기본값 trigram 0.4 / embedding 0.6이면 임베딩 없는 호출은 점수가 최대 0.55로 묶여 0.85 도달 불가)
    // 캐시 조회가 느리거나 멈춰도 전체 예산을 먹지 않도록 3초 자체 타임아웃 후 웹서치로 폴백.
    const rpc = supabase().rpc("search_works", {
      query_text: title,
      target_category: category,
      trigram_weight: 1.0,
      embedding_weight: 0.0,
      limit_count: 5,
    });
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: "cache lookup timeout" } }), 3000)
    );
    // deno-lint-ignore no-explicit-any
    const { data, error } = (await Promise.race([rpc, timeout])) as any;
    if (error) {
      console.error("lookupCache search_works error:", error);
      return null;
    }
    const best = data?.[0];
    if (!best) return null;
    // 신뢰 행만 캐시로 인정: 유저가 확정해 승격된 행(is_verified) 또는 외부 ingestion(primary_source)
    const trusted = best.is_verified === true || best.primary_source != null;
    if (best.similarity_score < CACHE_SIMILARITY_THRESHOLD || !trusted) return null;
    const candidate = {
      title: best.title,
      original_title: best.original_title ?? null,
      creator: best.creator ?? null,
      year: best.year ?? null,
      genre: best.genre ?? null,
      metadata: best.metadata ?? {},
      confidence: "high",
    };
    return { candidate, source_work_id: best.id as string, similarity: best.similarity_score as number };
  } catch (e) {
    console.error("lookupCache failed — 웹서치로 폴백:", e);
    return null;
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 탐색 트레이스: OpenAI Responses API의 output 배열에서 웹서치 과정/지표를 뽑아낸다.
// 응답에 _debug로 실어 앱에서 검색 과정을 로그 분석하듯 추적한다.
// deno-lint-ignore no-explicit-any
function buildTrace(data: any, ms: number, ok: boolean) {
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

// 에러에 트레이스를 실어 throw — catch 경로에서 _debug로 회수한다.
function withTrace(e: Error, trace: unknown): Error {
  (e as Error & { trace?: unknown }).trace = trace;
  return e;
}

// 메시지 annotation에서 인용 URL을 뽑아 트레이스에 채운다.
// deno-lint-ignore no-explicit-any
function extractCitations(message: any, trace: ReturnType<typeof buildTrace>) {
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

const OPENAI_URL = "https://api.openai.com/v1/responses";

// deno-lint-ignore no-explicit-any
function textOf(message: any): string | null {
  // deno-lint-ignore no-explicit-any
  const item = (message?.content ?? []).find((c: any) => typeof c.text === "string");
  return item?.text ?? null;
}

// ── 1단계: 탐색 ──
// GA web_search로 조사한다. allowed_domains 필터로 검색을 신뢰 소스(화이트리스트)로 강제 제한한다.
// gpt-4.1은 GA web_search + 도메인 필터를 지원한다 (gpt-4.1/nano, gpt-4o는 filters 미지원).
// temperature 0으로 변동성 최소화.
async function searchStep(prompt: string, allowedDomains: string[]) {
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
      model: MODEL,
      tools: [webSearch],
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
// "못 찾음"은 구조적으로 candidates:[]가 된다.
// deno-lint-ignore no-explicit-any
async function formatStep(prompt: string, schema: any, trace: ReturnType<typeof buildTrace>) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      temperature: 0,
      max_output_tokens: 2048,
      text: {
        format: { type: "json_schema", name: "content_candidates", strict: true, schema },
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

// 카테고리별 신뢰 소스. domain은 web_search의 allowed_domains 필터(검색 강제 제한)에,
// name은 프롬프트 소스 목록 표기에 함께 쓴다.
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

// ── Structured Outputs 스키마 (해결책 1) ──
// 카테고리별 metadata는 strict 모드 제약(모든 키 required + additionalProperties:false)을 지킨다.
// nullable은 type:["string","null"], 분기형(music/book)은 anyOf로 표현한다.
const STR_OR_NULL = { type: ["string", "null"] };
const STR_ARRAY = { type: "array", items: { type: "string" } };

function strictObject(props: Record<string, unknown>) {
  return {
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  };
}

function buildMetadataJsonSchema(category: string): Record<string, unknown> {
  switch (category) {
    case "movie":
    case "series":
      return strictObject({
        creator_style: STR_OR_NULL,
        cast: STR_ARRAY,
        synopsis: STR_OR_NULL,
        keywords: STR_ARRAY,
      });
    case "art":
      return strictObject({
        creator_style: STR_OR_NULL,
        medium: STR_OR_NULL,
        movement: STR_OR_NULL,
        keywords: STR_ARRAY,
      });
    case "music":
      return {
        anyOf: [
          strictObject({
            music_type: { type: "string", enum: ["album"] },
            creator_style: STR_OR_NULL,
            track_count: { type: ["integer", "null"] },
            keywords: STR_ARRAY,
          }),
          strictObject({
            music_type: { type: "string", enum: ["song"] },
            creator_style: STR_OR_NULL,
            release_format: STR_OR_NULL,
            keywords: STR_ARRAY,
          }),
        ],
      };
    case "book":
      return {
        anyOf: [
          strictObject({
            book_type: { type: "string", enum: ["fiction"] },
            creator_style: STR_OR_NULL,
            setting: STR_OR_NULL,
            perspective: STR_OR_NULL,
            keywords: STR_ARRAY,
          }),
          strictObject({
            book_type: { type: "string", enum: ["nonfiction"] },
            creator_style: STR_OR_NULL,
            field: STR_OR_NULL,
            core_argument: STR_OR_NULL,
            keywords: STR_ARRAY,
          }),
        ],
      };
    default:
      return strictObject({});
  }
}

function buildResponseJsonSchema(category: string): Record<string, unknown> {
  const candidate = strictObject({
    title: { type: "string" },
    original_title: STR_OR_NULL,
    creator: STR_OR_NULL,
    year: { type: ["integer", "null"] },
    genre: STR_OR_NULL,
    metadata: buildMetadataJsonSchema(category),
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  });
  return strictObject({
    candidates: { type: "array", items: candidate },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { title, creator, category, language, skipCache } = await req.json();
    const t0 = Date.now();

    // ── 0단계: 글로벌 캐시 조회 ──
    // skipCache=true('재검색')면 건너뛰고 바로 웹서치. 아니면 캐시 히트 시 웹서치 스킵.
    if (!skipCache) {
      const hit = await lookupCache(title, category);
      if (hit) {
        const ms = Date.now() - t0;
        console.log("verify-content cache hit:", JSON.stringify({
          title, category, ms, source_work_id: hit.source_work_id, similarity: hit.similarity,
        }));
        return new Response(
          JSON.stringify({
            candidates: [hit.candidate],
            _debug: {
              cache_hit: true,
              ms,
              source_work_id: hit.source_work_id,
              similarity: hit.similarity,
              search_count: 0,
              cited_domains: [],
            },
          }),
          { headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }
    }

    // 캐시 미스 → 실제 웹서치(OpenAI 비용) 직전에만 유저별 일일 상한 검사.
    // 캐시 히트는 비용이 없으므로 카운트하지 않는다.
    const gate = await enforceRateLimit(req, "search", SEARCH_RATE_LIMIT_PER_DAY, CORS, language);
    if (!gate.ok) return gate.response;

    const creatorLine = creator ? `창작자 힌트: ${creator}\n` : "";
    const lang = language === "ko" ? "한국어" : "English";
    const metadataSchema = buildMetadataSchema(category);
    const sourceList = buildSourceList(category);
    // 검색을 강제 제한할 도메인 (allowed_domains 필터). 모델이 임의로 site:로 더 좁히지 못하게 한다.
    const allowedDomains = (SOURCE_WHITELIST[category] ?? []).map((s) => s.domain);

    // ── 1단계 프롬프트: 자유 조사 (형식 강제 없음) ──
    // web_search 자체가 아래 도메인으로 제한되므로, 프롬프트에선 site: 지정 대신 검색어 다변화를 유도한다.
    const sourceBlock = sourceList
      ? `\nweb_search는 아래 신뢰 소스 도메인으로만 검색되도록 이미 제한되어 있다(별도로 site: 를 붙이지 말 것).
한 번의 검색으로 못 찾으면 포기하지 말고 검색어를 바꿔 여러 번 시도하라:
원제·영문 표기, 창작자명 단독, 로마자 표기 등 다양한 형태로 검색하라.
핵심 정보(창작자·발표 연도)는 가능하면 2개 이상의 소스에서 교차 확인하라.

검색 대상 신뢰 소스 (${category}):
${sourceList}
`
      : "";

    const searchPrompt = `너는 문화 콘텐츠 식별 전문가다.
web_search를 사용해 아래 작품을 조사하라.

규칙:
- 창작자 힌트가 있으면 해당 창작자의 작품을 우선 탐색
- 동일 제목의 작품이 여러 개 있으면 최대 5개까지 조사
- 확신할 수 없는 정보는 "불명"으로 표시 (추측 금지)
- 작품을 전혀 찾을 수 없으면 "식별 불가"라고 분명히 밝혀라
${sourceBlock}
조사가 끝나면 각 후보에 대해 아래 항목을 사실 위주로 정리해 보고하라(서술 형식은 자유):
제목 / 원제 / 창작자 / 발표 연도 / 장르 / 확신도(high·medium·low)
그리고 카테고리별 특성:
${metadataSchema}

제목: ${title}
카테고리: ${category}
${creatorLine}`;

    const { findings, trace } = await searchStep(searchPrompt, allowedDomains);

    // ── 2단계 프롬프트: 조사 결과를 strict JSON으로 정형화 ──
    const formatPrompt = `아래 "조사 결과"를 content_candidates JSON 스키마에 맞춰 변환하라.

규칙:
- 조사 결과에 근거해서만 채울 것. 조사 결과에 없는 정보를 추측·창작하지 말 것
- 확신할 수 없는 필드는 null
- keywords는 각 후보마다 최소 1개 이상
- 조사 결과가 "식별 불가"이거나 유효한 후보가 없으면 candidates를 빈 배열([])로 둘 것
- 모든 서술형 텍스트는 ${lang}로 작성

카테고리별 metadata 작성 지침:
${metadataSchema}

조사 결과:
"""
${findings}
"""

원본 입력 — 제목: ${title} / 카테고리: ${category}`;

    const { parsed } = await formatStep(formatPrompt, buildResponseJsonSchema(category), trace);
    trace.ms = Date.now() - t0; // 두 단계 합산

    console.log("verify-content trace:", JSON.stringify({
      title, category,
      ms: trace.ms,
      search_count: trace.search_count,
      cited_domains: trace.cited_domains,
      candidate_count: parsed?.candidates?.length ?? 0,
      format_status: trace.format_status,
      incomplete_reason: trace.incomplete_reason,
    }));

    return new Response(JSON.stringify({ ...parsed, _debug: trace }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    const trace = (error as { trace?: unknown }).trace ?? { error: String(error) };
    console.error("verify-content error:", error, JSON.stringify(trace));
    return new Response(
      JSON.stringify({
        error: "generation_failed",
        message: "작품을 검색하지 못했습니다.",
        _debug: trace,
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
