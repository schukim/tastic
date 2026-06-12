import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceUsageLimit } from "../_shared/usage.ts";
import { callJsonLLM } from "../_shared/llm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callLLM(prompt: string, temperature = 0.4, maxTokens = 2048) {
  // 로컬 E2E용 mock — MOCK_LLM=true일 때만 동작 (배포 환경엔 미설정)
  if (Deno.env.get("MOCK_LLM") === "true") {
    return { review_text: "[mock] 평론 본문", suggested_title: "[mock] 제목" };
  }
  // 클라이언트 타임아웃 30초 — 콜드스타트·전송 여유를 남기고 25초
  return callJsonLLM(prompt, { temperature, maxTokens, timeoutMs: 25_000 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { content, conversation_history, language, interview_id, is_preview } = await req.json();

    // 미리보기는 멤버십 전용, 최종 생성은 free 하루 1편 제한.
    // 같은 인터뷰(ref_id)의 재생성은 추가 카운트하지 않는다.
    const gate = await enforceUsageLimit(req, "review", {
      refId: interview_id ?? null,
      requireMembership: is_preview === true,
      language,
      cors: CORS,
    });
    if (!gate.ok) return gate.response;

    const conversationText = conversation_history
      .map((e: { role: string; text: string }) =>
        `${e.role === "interviewer" ? "인터뷰어" : "사용자"}: ${e.text}`
      )
      .join("\n");

    const prompt = `너는 개인 평론 작성자다. 인터뷰 대화를 바탕으로 사용자의 감상을 하나의 평론 글로 구성하라.

## 평론 작성 원칙

1. 화자 = 사용자: "나는", "내게" 등 1인칭 시점으로 작성. 사용자가 직접 쓴 것처럼 읽혀야 한다.
2. 감상 중심: 작품 줄거리 요약이 아닌, 사용자가 느끼고 생각한 것을 중심으로.
3. 인터뷰 내용 반영: 사용자가 실제로 언급한 내용만 포함. LLM이 임의로 감상을 추가하거나 과장하지 않는다.
4. 자연스러운 구성: 단순히 Q&A를 나열하지 않고, 하나의 흐름 있는 글로 재구성.
5. 문체: 문어체 평서문 — 모든 문장은 반드시 "~다"로 끝나는 평서형 종결어미("~했다", "~였다", "~싶다" 등)로 쓴다.
   - "~요", "~어요", "~습니다" 같은 구어체·경어체 종결은 절대 사용하지 않는다.
   - 인터뷰 답변이 구어체("좋았어요", "그랬던 것 같아요")여도 평론에서는 문어체("좋았다", "그랬다")로 변환한다.
   - 개인 에세이에 가까운 톤을 유지하되, 학술적이거나 저널리즘적 문체는 피한다.

## 구성 가이드

- 도입: 이 작품을 접하게 된 계기 또는 첫인상 (인터뷰에서 언급된 경우)
- 본문: 인터뷰에서 가장 깊이 다뤄진 주제 2~3개를 자연스럽게 연결
- 마무리: 이 작품이 자신에게 남긴 것, 또는 변화시킨 것

## 분량
- 한국어: 400~800자
- 영어: 200~400 words

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "review_text": "string",
  "suggested_title": "string"
}

작품 정보:
- 제목: ${content.title}
- 카테고리: ${content.category}
- 창작자: ${content.creator ?? "정보 없음"}
- 연도: ${content.year ?? "정보 없음"}
- 장르: ${content.genre ?? "정보 없음"}

인터뷰 대화:
${conversationText}`;

    const parsed = await callLLM(prompt, 0.4);

    if (is_preview !== true) await gate.logUsage();

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-review error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "평론을 생성하지 못했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
