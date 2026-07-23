import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceUsageLimit, adminClient } from "../_shared/usage.ts";
import { callJsonLLM } from "../_shared/llm.ts";
import {
  allowedDomainsFor,
  buildSourceList,
  CORS,
  formatStep,
  searchStep,
  SOURCE_WHITELIST,
  STR_ARRAY,
  STR_OR_NULL,
  strictObject,
} from "../_shared/websearch.ts";

// 추천 최소 평론 수 — 클라이언트 게이트와 동일하게 서버에서도 강제.
const MIN_REVIEWS = 3;
// user_prompt 서버측 길이 상한 (클라 maxLength 300 + 여유). 초과분은 잘라 방어.
const MAX_PROMPT_LEN = 500;
// 웹서치가 조사할 후보 수 상한 / 캐시 대조 상한 / 최종 반환 상한.
const MAX_CANDIDATES = 10;
const MAX_FINAL = 5;
// 캐시 재사용/실존 판정 임계값 (verify-content·save-verified-work 와 동일).
const CACHE_SIMILARITY_THRESHOLD = 0.85;

const VALID_CATEGORIES = ["movie", "music", "book", "art", "series"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

interface Candidate {
  title: string;
  original_title: string | null;
  creator: string | null;
  year: number | null;
  category: string;
  sources: string[];
}

interface VerifiedCandidate extends Candidate {
  verified: boolean;
  source_url: string | null;
  external_ids: Record<string, string> | null;
  // 실존 근거의 출처: cache(works 카탈로그 대조) | web(실제 검색 인용). 모니터링용.
  verification_source: "cache" | "web";
}

// 제목 대조용 정규화 — 공백·구두점 제거, 소문자. 감상 이력 중복 판정에 사용.
function normalizeTitle(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 후보 sources 중, "이번 검색이 실제로 인용한 도메인"에 속하는 URL만 남긴다.
// 화이트리스트 도메인만 검사하면 format 모델이 그럴싸한 URL을 지어내도 통과하므로,
// searchStep이 실제로 방문·인용한 도메인(trace.cited_domains)과 대조한다.
function groundedSources(sources: string[], citedDomains: Set<string>): string[] {
  if (citedDomains.size === 0) return [];
  return (sources ?? []).filter((u) => {
    const h = hostnameOf(u);
    if (!h) return false;
    return [...citedDomains].some((d) => h === d || h.endsWith(`.${d}`));
  });
}

// ── Structured Outputs 스키마: 추천 후보 ──
// 각 후보는 실존 근거로 sources(인용 URL)를 반드시 담는다. 못 찾으면 candidates:[].
function buildCandidateSchema(): Record<string, unknown> {
  const candidate = strictObject({
    title: { type: "string" },
    original_title: STR_OR_NULL,
    creator: STR_OR_NULL,
    year: { type: ["integer", "null"] },
    category: { type: "string", enum: [...VALID_CATEGORIES] },
    sources: STR_ARRAY,
  });
  return strictObject({ candidates: { type: "array", items: candidate } });
}

// ── 캐시 대조 ──
// 입력 후보는 이미 실제 검색 인용으로 근거됨(grounded) → verified=true.
// 여기서 works 카탈로그에 정본이 있으면 external_ids·정본 정보를 추가로 부착하고
// verification_source를 "cache"로 승격한다(없으면 "web").
async function crossCheckCache(cand: Candidate): Promise<VerifiedCandidate> {
  const validCat = (VALID_CATEGORIES as readonly string[]).includes(cand.category)
    ? (cand.category as Category)
    : null;
  const base: VerifiedCandidate = {
    ...cand,
    verified: true,
    source_url: cand.sources[0] ?? null,
    external_ids: null,
    verification_source: "web",
  };
  try {
    const { data, error } = await adminClient().rpc("search_works", {
      query_text: cand.title,
      target_category: validCat,
      trigram_weight: 1.0,
      embedding_weight: 0.0,
      limit_count: 3,
    });
    if (error) {
      console.error("crossCheckCache search_works error:", error.message);
      return base;
    }
    const best = data?.[0];
    if (!best) return base;
    const trusted = best.is_verified === true || best.primary_source != null;
    if (best.similarity_score >= CACHE_SIMILARITY_THRESHOLD && trusted) {
      // 캐시 정본 정보로 승격 — 제목·창작자·연도는 검증된 값 우선.
      return {
        title: best.title ?? cand.title,
        original_title: best.original_title ?? cand.original_title,
        creator: best.creator ?? cand.creator,
        year: best.year ?? cand.year,
        category: best.category ?? cand.category,
        sources: cand.sources,
        verified: true,
        source_url: cand.sources[0] ?? null,
        external_ids: (best.external_ids as Record<string, string> | null) ?? null,
        verification_source: "cache",
      };
    }
    return base;
  } catch (e) {
    console.error("crossCheckCache failed:", e);
    return base;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    // user_prompt(정당한 사용자 입력)와 language만 받는다. 취향 프로파일·감상 이력은
    // 서버가 DB에서 본인 데이터로 조회한다(클라이언트가 보낸 임의 데이터 신뢰 금지).
    const body = await req.json();
    const language = body?.language === "en" ? "en" : "ko";
    // 서버측 입력 검증: 문자열·길이. 초과분은 잘라 안전 처리.
    const rawPrompt = typeof body?.user_prompt === "string" ? body.user_prompt : "";
    const userPrompt = rawPrompt.trim().slice(0, MAX_PROMPT_LEN);
    if (!userPrompt) {
      return new Response(
        JSON.stringify({ error: "invalid_request", message: language === "en" ? "Empty request." : "요청이 비어 있어요." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // free 플랜은 추천 하루 1회 (membership 무제한)
    const gate = await enforceUsageLimit(req, "recommendation", { language, cors: CORS });
    if (!gate.ok) return gate.response;

    let responsePayload: unknown;
    try {
      // 본인 감상 이력을 DB에서 조회 (works 조인). 예약 이후 전 구간을 try로 감싸 실패 시 롤백.
      const { data: reviewRows, error: rErr } = await adminClient()
        .from("reviews")
        .select("body, works(title, category, creator)")
        .eq("user_id", gate.userId)
        .order("created_at", { ascending: false });
      if (rErr) throw new Error(`reviews fetch failed: ${rErr.message}`);

      const rows = (reviewRows ?? []) as {
        body: string;
        works: { title: string; category: string; creator: string | null } | null;
      }[];
      // 서버에서 본인 평론 수를 실제 확인 — 3편 미만이면 예약 롤백 후 거절
      if (rows.length < MIN_REVIEWS) {
        await gate.release();
        return new Response(
          JSON.stringify({
            error: "not_enough_reviews",
            message: language === "en" ? "You need at least 3 reviews." : "평론이 3편 이상 필요해요.",
          }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      // 감상 이력(중복 차단용 정규화 제목 집합) + 프롬프트 표기
      const watchedTitles = new Set(
        rows.map((r) => normalizeTitle(r.works?.title ?? "")).filter((t) => t.length > 0),
      );
      const historyText = rows
        .map((r) => `- [${r.works?.category ?? ""}] ${r.works?.title ?? ""}`)
        .join("\n");
      // 추천 이유를 실제 평론과 연결하기 위한 발췌 (최대 6편, 본문 200자)
      const reviewExcerpts = rows
        .slice(0, 6)
        .map((r) => `[${r.works?.category ?? ""}] ${r.works?.title ?? ""}\n${(r.body ?? "").slice(0, 200)}`)
        .join("\n---\n");

      // 취향 프로파일도 DB에서 조회
      const { data: tp } = await adminClient()
        .from("taste_profiles")
        .select("profile_sentences")
        .eq("user_id", gate.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tasteProfile: string[] = tp?.profile_sentences ?? [];

      // 로컬 E2E용 mock — MOCK_LLM=true일 때만 동작 (배포 환경엔 미설정).
      // 게이트·평론수 검사는 위에서 그대로 거치고, LLM 파이프라인만 건너뛴다.
      if (Deno.env.get("MOCK_LLM") === "true") {
        const recommendations = [{
          title: "[mock] 추천작", category: "movie", creator: "mock", year: 2024,
          reason: "mock", reason_short: "mock", verified: true,
          source_url: "https://themoviedb.org/mock", external_ids: null,
          verification_source: "web",
        }];
        await adminClient().from("recommendations").insert({ user_id: gate.userId, prompt: userPrompt, results: recommendations });
        return new Response(JSON.stringify({ recommendations }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const lang = language === "ko" ? "한국어" : "English";
      // 크로스 카테고리 — 전 카테고리 신뢰 소스 도메인으로 web_search를 강제 제한.
      const allowedDomains = allowedDomainsFor(null);
      const sourceList = Object.keys(SOURCE_WHITELIST)
        .map((cat) => `【${cat}】\n${buildSourceList(cat)}`)
        .join("\n");

      // ── 1단계: web_search로 "실존하는" 후보 작품을 조사 (자유 생성 금지) ──
      const searchPrompt = `너는 문화 콘텐츠 큐레이터다. 아래 사용자의 취향과 요청에 맞는 "실제로 존재하는" 작품을 web_search로 조사해 후보를 모아라.

규칙:
- 반드시 web_search로 확인된 실존 작품만 후보로 삼는다. 기억에 의존해 지어내지 말 것.
- 각 후보는 신뢰 소스에서 확인된 제목·창작자·발표연도를 함께 조사한다.
- 카테고리 경계를 넘어도 좋다(영화·음악·책·미술·시리즈). 사용자가 특정 카테고리를 요청했으면 그것을 우선한다.
- 이미 감상한 작품(아래 목록)은 후보에서 제외한다.
- 같은 창작자의 작품은 하나만.
- ${MAX_CANDIDATES}개 이내로 조사한다.

web_search는 아래 신뢰 소스 도메인으로만 검색되도록 제한되어 있다(site: 를 붙이지 말 것):
${sourceList}

취향 프로파일:
${tasteProfile.join("\n") || "(아직 없음)"}

사용자 요청: ${userPrompt}

이미 감상한 작품:
${historyText}`;

      const { findings, trace } = await searchStep(searchPrompt, allowedDomains);
      // 이번 검색이 실제로 인용한 출처 URL/도메인 — 후보 근거 대조의 기준(지어낸 URL 차단).
      const citedDomains = new Set(trace.cited_domains);
      const citationList = trace.citations.slice(0, 24).map((c) => `- ${c.url}`).join("\n");

      // ── 2단계: 조사 결과를 strict JSON 후보로 정형화 (sources=실제 인용 URL만) ──
      const formatPrompt = `아래 "조사 결과"를 recommendation_candidates JSON 스키마에 맞춰 변환하라.

규칙:
- 조사 결과에 근거해서만 채울 것. 조사 결과에 없는 작품을 추측·창작하지 말 것.
- 각 후보의 sources 에는 아래 "실제 인용된 출처 URL 목록"에 있는 URL만, 그 작품에 해당하는 것으로 1개 이상 담을 것. 목록에 없는 URL을 지어내지 말 것. 해당 URL이 없으면 그 후보는 넣지 말 것.
- category는 movie/music/book/art/series 중 하나.
- 확신할 수 없는 필드(창작자·연도 등)는 null.
- 유효한 후보가 없으면 candidates를 빈 배열([])로 둘 것.

실제 인용된 출처 URL 목록:
${citationList || "(없음)"}

조사 결과:
"""
${findings}
"""`;

      const { parsed } = await formatStep(formatPrompt, buildCandidateSchema(), trace, "recommendation_candidates");
      const rawCandidates: Candidate[] = Array.isArray((parsed as { candidates?: unknown })?.candidates)
        ? (parsed as { candidates: Candidate[] }).candidates
        : [];

      // ── 서버 코드 필터 (프롬프트 아님) ──
      // 1) 미근거 드롭(실제 인용 도메인과 대조)  2) 감상작 중복 드롭  3) 동일 창작자 1개 제한
      const seenCreators = new Set<string>();
      let dropped_no_source = 0;
      let dropped_dup = 0;
      let dropped_creator = 0;
      const filtered: Candidate[] = [];
      for (const c of rawCandidates) {
        if (!c?.title || typeof c.title !== "string") continue;
        // 실제 검색이 인용한 도메인에 속한 sources만 인정 — 없으면 근거 없는 후보로 드롭.
        const grounded = groundedSources(c.sources, citedDomains);
        if (grounded.length === 0) {
          dropped_no_source++;
          continue;
        }
        if (watchedTitles.has(normalizeTitle(c.title))) {
          dropped_dup++;
          continue;
        }
        const creatorKey = (c.creator ?? "").trim().toLowerCase();
        if (creatorKey && seenCreators.has(creatorKey)) {
          dropped_creator++;
          continue;
        }
        if (creatorKey) seenCreators.add(creatorKey);
        filtered.push({ ...c, sources: grounded });
        if (filtered.length >= MAX_CANDIDATES) break;
      }

      // ── 캐시 대조 → external_ids·verified 부착 ──
      const verified: VerifiedCandidate[] = [];
      for (const c of filtered) {
        verified.push(await crossCheckCache(c));
      }

      const trace_summary = {
        candidate_count: rawCandidates.length,
        dropped_no_source,
        dropped_dup,
        dropped_creator,
        // 살아남은 후보는 전부 실제 인용으로 근거됨(verified). cache/web은 근거 출처 구분.
        cache_verified: verified.filter((v) => v.verification_source === "cache").length,
        web_verified: verified.filter((v) => v.verification_source === "web").length,
        surviving: verified.length,
        search_count: trace.search_count,
        cited_domains: trace.cited_domains,
      };

      // 검증 통과 후보가 하나도 없으면 사용량 롤백 후 빈 결과 반환(하위호환: 클라 빈 상태 처리).
      if (verified.length === 0) {
        await gate.release();
        console.log("recommend-content trace (empty):", JSON.stringify(trace_summary));
        return new Response(
          JSON.stringify({ recommendations: [] }),
          { headers: { ...CORS, "Content-Type": "application/json" } },
        );
      }

      // ── 3단계: 순위·이유 작성 (deepseek, 웹 불필요·저렴) ──
      // 사실(제목·창작자·연도)은 검증본을 서버가 유지하고, deepseek에는 index별 이유 텍스트만 받는다.
      const candidateList = verified
        .map((v, i) => `${i}. [${v.category}] ${v.title}${v.creator ? " — " + v.creator : ""}${v.year ? " (" + v.year + ")" : ""}`)
        .join("\n");

      const reasons: Record<number, { reason: string; reason_short: string }> = {};
      let finalOrder: number[];
      try {
        const rankPrompt = `너는 문화 콘텐츠 큐레이터다. 아래 "검증된 후보 작품"들에 대해 사용자의 취향·평론과 어떻게 연결되는지 추천 이유를 작성하라.

규칙:
- 후보의 제목·창작자를 바꾸지 말 것. 아래 목록에 없는 작품을 추가하지 말 것.
- 각 이유는 사용자의 취향 프로파일과 실제 평론에서 드러난 감상 성향에 근거해 구체적으로 연결할 것.
- 사용자에게 잘 맞을 순서대로 최대 ${MAX_FINAL}개만 골라라.
- ${lang}로 작성.

반드시 아래 json 형식으로만 응답하라(i는 후보 번호):
{"ranked": [{"i": 0, "reason": "취향과 연결한 1~2문장 상세", "reason_short": "1줄 요약"}]}

취향 프로파일:
${tasteProfile.join("\n") || "(아직 없음)"}

사용자 요청: ${userPrompt}

사용자 평론 발췌:
${reviewExcerpts}

검증된 후보 작품:
${candidateList}`;

        const ranked = (await callJsonLLM(rankPrompt, { temperature: 0.4, maxTokens: 1200, timeoutMs: 20_000 })) as {
          ranked?: { i: number; reason?: string; reason_short?: string }[];
        };
        const list = Array.isArray(ranked?.ranked) ? ranked.ranked : [];
        const order: number[] = [];
        for (const item of list) {
          if (typeof item.i === "number" && item.i >= 0 && item.i < verified.length && !(item.i in reasons)) {
            reasons[item.i] = {
              reason: (item.reason ?? "").trim() || (language === "en" ? "Matches your taste." : "취향과 잘 맞아요."),
              reason_short: (item.reason_short ?? "").trim() || (language === "en" ? "For you" : "취향 저격"),
            };
            order.push(item.i);
          }
        }
        // deepseek가 고른 순서를 우선, 나머지는 원 순서 뒤에 붙임
        finalOrder = order.concat(verified.map((_, i) => i).filter((i) => !order.includes(i)));
      } catch (e) {
        console.error("recommend-content rank step failed — 폴백:", e);
        finalOrder = verified.map((_, i) => i);
      }

      const recommendations = finalOrder.slice(0, MAX_FINAL).map((i) => {
        const v = verified[i];
        const r = reasons[i];
        return {
          title: v.title,
          category: v.category,
          creator: v.creator ?? "",
          year: v.year,
          reason: r?.reason ?? (language === "en" ? "Matches your taste." : "취향과 잘 맞아요."),
          reason_short: r?.reason_short ?? (language === "en" ? "For you" : "취향 저격"),
          verified: v.verified,
          source_url: v.source_url,
          external_ids: v.external_ids,
          verification_source: v.verification_source,
        };
      });

      // ── 서버 저장 (검증 후) — 클라이언트 저장 제거 ──
      const { error: saveErr } = await adminClient()
        .from("recommendations")
        .insert({ user_id: gate.userId, prompt: userPrompt, results: recommendations });
      if (saveErr) console.error("recommend-content save error:", saveErr.message);

      console.log("recommend-content trace:", JSON.stringify({ ...trace_summary, returned: recommendations.length }));
      responsePayload = { recommendations };
    } catch (e) {
      await gate.release(); // 예약 이후 어떤 실패(입력·조회·LLM·타임아웃)든 사용량 롤백
      throw e;
    }

    return new Response(JSON.stringify(responsePayload), {
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
