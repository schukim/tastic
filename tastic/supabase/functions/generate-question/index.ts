import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callOpenAI(prompt: string, temperature = 0.7, maxTokens = 512) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "OpenAI error");
  return JSON.parse(data.choices[0].message.content);
}

const TURN_ROLE: Record<number, string> = {
  2: "탐색 — deep(깊이)/bridge(작품 연결)/wide(넓이) 중 사용자 답변과 작품 정보에 따라 판단. should_end는 반드시 false",
  3: "탐색 — deep(깊이)/bridge(작품 연결)/wide(넓이) 중 사용자 답변과 작품 정보에 따라 판단. should_end는 반드시 false",
  4: "탐색 — deep(깊이)/bridge(작품 연결)/wide(넓이) 중 사용자 답변과 작품 정보에 따라 판단. should_end는 반드시 false",
  5: "정리(wrap_up) — 감상의 조각들을 사용자 스스로 연결하게 만드는 마무리 질문. 이 답변이 리뷰의 핵심 문장이 된다. should_end는 반드시 false",
  6: "조건부 추가 — 아래 6번째 질문 조건 섹션 참고",
};

// first_questions는 인터뷰 첫 질문 캐시(클라이언트용)라 작품 정보가 아님 — 프롬프트에서 제외
const METADATA_EXCLUDE_KEYS = new Set(["first_questions"]);

function formatMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return "";
  const entries = Object.entries(metadata).filter(
    ([k, v]) => !METADATA_EXCLUDE_KEYS.has(k) && v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return "";

  const lines = entries.map(([k, v]) => {
    if (Array.isArray(v)) return `- ${k}: ${(v as unknown[]).join(", ")}`;
    if (typeof v === "object") return `- ${k}: ${JSON.stringify(v)}`;
    return `- ${k}: ${v}`;
  });

  return `\n추가 작품 정보 (질문 재료로 활용):\n${lines.join("\n")}`;
}

function buildPrompt(
  content: { title: string; category: string; creator: string | null; year: number | null; genre: string | null; metadata: Record<string, unknown> },
  conversationText: string,
  askedQuestionsText: string,
  questionCount: number,
  language: string,
): string {
  const turnNumber = questionCount + 1;
  const turnRole = TURN_ROLE[turnNumber] ?? TURN_ROLE[2];

  const musicScopeSection =
    content.category === "music"
      ? `\n## 음악 카테고리 스코프\n- 곡 단위 (metadata.music_type === "song"): 하나의 곡 안에서의 감정, 사운드, 순간에 집중\n- 앨범 단위 (metadata.music_type === "album"): 트랙 간의 흐름, 전체 구성, 앨범의 서사/컨셉\n- 현재: ${content.metadata?.music_type === "song" ? "곡 단위" : "앨범 단위"}\n`
      : "";

  const bookScopeSection =
    content.category === "book"
      ? `\n## 책 카테고리 스코프\n- 소설/스토리 (metadata.book_type === "fiction"): 배경, 시점, 인물, 서사 구조, 감정적 몰입에 집중. 독자가 "어떤 장면에서 감정이 움직였는가"를 끌어낼 것\n- 비소설/에세이/이론서 (metadata.book_type === "nonfiction"): 핵심 논지, 저자의 관점, 독자의 생각 변화, 실용성에 집중. "이 책을 읽고 달라진 것"을 끌어낼 것\n- 현재: ${content.metadata?.book_type === "nonfiction" ? "비소설" : "소설/스토리"}\n`
      : "";

  const extraTurnSection =
    questionCount === 5
      ? `\n## 6번째 질문 생성 조건\n다음 중 하나라도 해당할 때만 질문을 생성하라:\n1. 직전 답변이 길고 새로운 키워드/맥락이 등장했을 때\n2. 감상의 핵심이 아직 정리되지 않은 느낌일 때\n해당하지 않으면 반드시 should_end: true를 반환하라.\n`
      : "";

  return `너는 문화 콘텐츠 감상 인터뷰어다. 사용자가 감상한 작품에 대해 자연스럽게 감상을 끌어내는 것이 목표다.

## 타겟 유저
별점은 남기지만 글로 쓰는 건 낯선 미들 유저. "말하고 싶은데 어떻게 시작할지 모르겠는" 사람들. 평론가가 아닌 감상자를 위한 질문이어야 한다.

## 현재 턴: ${turnNumber}번째 질문
역할: ${turnRole}
${extraTurnSection}
## 질문 재료 — 작품 정보 활용 (가장 중요)
하단 "작품 정보"의 creator_style(창작자 고유 스타일), keywords(작품 고유 키워드), synopsis 등은 질문을 이 작품에 특화시키기 위한 재료다.
- 매 질문은 (a) 직전 답변의 구체적 키워드, (b) 작품의 고유 요소, 둘 중 최소 하나에 기반해야 한다. 둘을 연결하면 가장 좋은 질문이 된다.
- 작품의 알려진 요소를 네가 먼저 제시하고 사용자의 반응을 묻는 방식을 적극 사용하라.
  - 좋은 예: "기생충은 반지하와 저택의 공간 대비가 두드러지는데, 두 공간을 오갈 때 어떤 감정이 들었나요?"
  - 나쁜 예: "이 영화에서 가장 인상적인 장면은 무엇이었나요?" (어느 작품에나 붙일 수 있는 질문)
- 단, 사용자가 답할 수 없는 사실을 묻지 말 것. 사실은 네가 제시하고, 그에 대한 감상을 물어라.

## 질문 유형 (question_type)
- deep: 직전 답변에서 흥미로운 지점을 깊이 파고든다.
  사용 기준: 구체적인 장면/감정/요소가 언급됐지만 "왜"가 아직 드러나지 않았을 때.
  예: "그 장면이 긴장됐어요" → "어떤 종류의 긴장이었나요?"
- bridge: 사용자의 감상을 작품의 고유 요소(creator_style, keywords, 구성)와 연결한다.
  사용 기준: 사용자의 감상이 작품의 알려진 특성과 맞닿아 있어서, 그 연결을 짚어주면 감상이 더 선명해질 때.
  예: 사용자가 "분위기가 무거웠어요"라고 답함 + creator_style에 "길게 끊지 않는 롱테이크 연출" → "그 무거움이 장면을 길게 끊지 않고 이어가는 연출 때문이었을까요, 아니면 이야기 자체 때문이었을까요?"
- wide: 새로운 주제 축으로 전환한다.
  사용 기준: 이전 주제가 충분히 탐색되었거나, 답변이 짧고 건조하여 다른 각도가 필요할 때. 아래 카테고리별 질문 관점 중 아직 다루지 않은 축을 고른다.
- wrap_up: 감상의 조각들을 사용자 스스로 연결하게 만드는 마무리 질문.

## topic_label 규칙
- deep/bridge: 직전 질문과 동일한 topic_label을 유지
- wide: 새 주제를 나타내는 짧은 라벨 (예: "공간의 대비", "사운드", "캐릭터")

## 카테고리별 질문 관점 (wide 전환 시 참고)
- 영화/시리즈: 연출, 촬영/미장센, 서사 구조, 캐릭터, 사운드/음악, 사회적 맥락
- 음악: 사운드 텍스처, 가사, 감정 곡선, 트랙 간 흐름(앨범), 청취 맥락(언제/어디서)
- 책: 문체, 서사 시점, 캐릭터 심리, 주제의식, 읽기 경험(속도, 몰입)
- 미술: 매체/기법, 시각 요소, 공간감, 작가 의도에 대한 개인 해석
${musicScopeSection}${bookScopeSection}
## 톤 적응
사용자 답변 스타일을 그대로 따라간다:
- 감정 언어 사용 → 감정 방향으로
- 분석 언어 사용 → 구조적 방향으로
- 둘 다 섞으면 → 섞어서

## 짧은 답변 대응 (사용자가 "좋았어요", "별로" 등 짧게 답했을 때)
다음 세 전략 중 맥락에 맞게 하나를 선택:
1. 선택지 제시: "캐릭터가 좋았는지, 분위기가 좋았는지, 스토리 전개가 좋았는지?"
2. 구체적 순간: "어떤 장면에서 그런 느낌이 들었나요?"
3. 작품 요소 제시(bridge): 작품 정보의 구체 요소를 제시하고 그에 대한 반응을 묻기 (결말·반전 언급 주의)

## 답변 처리 원칙
- 사용자 답변의 핵심 키워드를 자연스럽게 되돌려줄 것 ("내 말을 이해했구나" 느낌)
- 직관적으로 말한 것에 살짝 깊이를 더해서 되돌려주면 감상이 더 선명해진다
- 단, 사용자가 말하지 않은 것을 과도하게 덧붙이지 말 것

## 좋은 질문 조건
1. 직전 답변의 구체적 키워드 또는 작품의 고유 요소에 기반할 것 (그 답변/그 작품이어야만 나올 수 있는 질문)
2. 답변이 리뷰의 한 문장이 될 수 있을 것
3. 사용자 언어 수준과 스타일에 맞출 것
4. 하나의 질문만 던질 것

## 금지 패턴
1. 이미 답한 내용을 다시 묻거나, "지금까지 던진 질문"과 주제·표현이 겹치는 질문
2. 어떤 답변 뒤에도 붙일 수 있는 범용 질문 ("어떻게 느끼셨나요?", "더 말씀해주실 수 있나요?")
3. 사용자가 답할 수 없는 사실을 요구하는 질문 ("감독의 의도는 무엇이었을까요?", "미술사적 맥락은?")
   — 단, 알려진 사실을 네가 제시하고 그에 대한 사용자의 감상을 묻는 것은 금지가 아니라 권장이다.
4. 범위가 너무 넓고 모호한 질문 ("이 작품이 당신의 삶에 미친 영향은?")
5. 한 턴에 두 개 이상의 질문

## 자기 검증 (질문 확정 전 반드시 확인)
① 이 질문은 직전 답변의 구체적 키워드 또는 작품의 고유 요소에 기반하고 있는가? (둘 다 아니면 탈락)
② 이 질문은 "지금까지 던진 질문"과 주제·표현이 겹치지 않는가?
③ 이 질문의 답변이 최종 리뷰에 실제로 쓸 수 있는 재료를 만들어내는가?
④ 이 질문이 금지 패턴에 해당하지 않는가?
네 가지 모두 통과해야만 질문을 확정한다.

${language === "ko" ? "한국어" : "English"}로 질문을 생성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "question": "string (should_end가 true이면 빈 문자열)",
  "question_type": "deep | bridge | wide | wrap_up",
  "topic_label": "string (should_end가 true이면 빈 문자열)",
  "should_end": false
}

작품 정보:
- 제목: ${content.title}
- 카테고리: ${content.category}
- 창작자: ${content.creator ?? "정보 없음"}
- 연도: ${content.year ?? "정보 없음"}
- 장르: ${content.genre ?? "정보 없음"}${formatMetadata(content.metadata)}

지금까지 던진 질문 (중복 금지):
${askedQuestionsText}

이전 대화:
${conversationText}

현재 질문 번호: ${turnNumber}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS } });
  }

  try {
    const { content, conversation_history, question_count, language } = await req.json();

    // Guard: max 6 turns
    if (question_count >= 6) {
      return new Response(
        JSON.stringify({ question: "", question_type: "wrap_up", topic_label: "", should_end: true }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const conversationText =
      conversation_history.length > 0
        ? conversation_history
            .map((e: { role: string; text: string }) =>
              `${e.role === "interviewer" ? "인터뷰어" : "사용자"}: ${e.text}`
            )
            .join("\n")
        : "(이전 대화 없음)";

    // 중복 방지용 — 지금까지 던진 질문을 topic_label과 함께 별도 목록으로 제공
    const askedQuestions = conversation_history.filter(
      (e: { role: string }) => e.role === "interviewer"
    );
    const askedQuestionsText =
      askedQuestions.length > 0
        ? askedQuestions
            .map(
              (e: { text: string; topic_label?: string }, i: number) =>
                `${i + 1}. [${e.topic_label || "-"}] ${e.text}`
            )
            .join("\n")
        : "(없음)";

    const prompt = buildPrompt(content, conversationText, askedQuestionsText, question_count, language);
    const parsed = await callOpenAI(prompt, 0.7, 512);

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-question error:", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", message: "질문을 생성하지 못했습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
