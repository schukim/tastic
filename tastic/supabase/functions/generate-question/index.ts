import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callJsonLLM } from "../_shared/llm.ts";
import { enforceRateLimit } from "../_shared/usage.ts";

// 유저별 질문 생성 일일 상한(비용 남용 방어). 정상 인터뷰는 6~10문항, 하루 수 회.
const QUESTION_RATE_LIMIT_PER_DAY = 100;
// 무료 플랜 문답 상한 — 클라이언트 useInterview.ts FREE_MAX_QUESTIONS 와 일치(서버 강제).
const FREE_MAX_QUESTIONS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 인터뷰 절대 상한 — 비용 안전장치.
// 클라이언트 useInterview.ts 의 MEMBERSHIP_MAX_QUESTIONS 와 반드시 일치시킬 것.
// (무료 플랜은 클라이언트에서 5문답에 종료되어 이 상한에 도달하지 않는다.)
const MAX_QUESTIONS = 10;

// 턴 역할 재설계 노트: 기존에는 2~4턴이 전부 동일한 "탐색"이라 질문이 국소 최적
// (직전 답변에서 흥미로운 것 하나)만 반복하며 비슷해지고, 평론에 긴장을 만드는
// '마찰'(아쉬움·어긋남) 재료를 뽑는 자리가 없었다. → 각 턴을 평론 기승전결의
// 재료 수집 단계로 매핑: 1턴(기·첫인상, 클라이언트 캐시) → 2~3턴(승·전개) →
// 4턴(전·마찰) → 5턴(결·정리). question_type은 전술(어떻게 묻는가)로 직교 유지.
const TURN_ROLE: Record<number, string> = {
  2: "전개(승) — 감상의 중심축을 찾아 넓히고 파는 단계. deep(깊이)/bridge(작품 연결)/wide(넓이) 중 사용자 답변과 작품 정보에 따라 판단. should_end는 반드시 false",
  3: "전개(승) — 감상의 중심축을 찾아 넓히고 파는 단계. deep(깊이)/bridge(작품 연결)/wide(넓이) 중 사용자 답변과 작품 정보에 따라 판단. should_end는 반드시 false",
  4: "마찰(전) — 아쉬움·기대와 어긋난 점·의외였던 점을 캐는 단계. 아래 '마찰 턴 지침' 섹션을 반드시 따를 것. should_end는 반드시 false",
  5: "정리(결) — 이 작품에서 결국 가장 남은 것 하나를 묻는 마무리 질문(wrap_up). 감상의 연결·정리는 평론 생성이 맡으므로 사용자에게 '정리해보라'고 요구하지 말 것. 이 답변이 평론의 마지막 문단 재료가 된다. should_end는 반드시 false",
  6: "보강 — 아래 추가 질문 조건 섹션 참고",
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
  // 6번째 이후(멤버십 연장)는 "조건부 추가" 역할을 유지 — 소진되면 자연 종료되도록 유도
  const turnRole = TURN_ROLE[turnNumber] ?? (turnNumber >= 6 ? TURN_ROLE[6] : TURN_ROLE[2]);

  const musicScopeSection =
    content.category === "music"
      ? `\n## 음악 카테고리 스코프\n- 곡 단위 (metadata.music_type === "song"): 하나의 곡 안에서의 감정, 사운드, 순간에 집중\n- 앨범 단위 (metadata.music_type === "album"): 트랙 간의 흐름, 전체 구성, 앨범의 서사/컨셉\n- 현재: ${content.metadata?.music_type === "song" ? "곡 단위" : "앨범 단위"}\n`
      : "";

  const bookScopeSection =
    content.category === "book"
      ? `\n## 책 카테고리 스코프\n- 소설/스토리 (metadata.book_type === "fiction"): 배경, 시점, 인물, 서사 구조, 감정적 몰입에 집중. 독자가 "어떤 장면에서 감정이 움직였는가"를 끌어낼 것\n- 비소설/에세이/이론서 (metadata.book_type === "nonfiction"): 핵심 논지, 저자의 관점, 독자의 생각 변화, 실용성에 집중. "이 책을 읽고 달라진 것"을 끌어낼 것\n- 현재: ${content.metadata?.book_type === "nonfiction" ? "비소설" : "소설/스토리"}\n`
      : "";

  // 마찰(전) 턴 전용 지침 — 해당 턴에만 주입해 프롬프트 집중도를 유지한다.
  // 저부담 원칙과의 양립: "아쉬웠던 부분이 있었나요?"는 호불호(겪은 것)를 묻는
  // 질문이라 한 문장으로 답할 수 있다. 아쉬움의 '원인 분석'을 시키는 게 금지다.
  const frictionSection =
    turnNumber === 4
      ? `\n## 마찰 턴 지침 (이번 턴)\n평론에 긴장을 만드는 재료 — 아쉬움, 기대와 어긋난 점, 의외였던 점 — 를 이번 턴에 캔다.\n1. 이전 답변에 이미 부정적·유보적 신호("좀 늘어졌어요", "기대만큼은 아니었어요", "~는 잘 모르겠어요")가 있으면: 그 지점을 deep으로 판다. 원인 분석이 아니라 그 느낌이 가장 강했던 순간·부분으로 좁힌다.\n2. 신호가 없으면: 가볍게 새로 연다. 기본형은 사실 주장이 없는 "기대와 달랐던 점이나 아쉬웠던 부분도 있었나요?". 작품의 고유 요소나 평판("후반부는 호불호가 갈리던데" 등)에 붙이는 것은 그 사실이 "작품 사실의 출처 제한"을 만족할 때만 — 평판·반응을 지어내지 마라.\n3. 강요하지 않는다. 사용자가 전부 만족했다면 "없었다"고 답해도 되는 열린 형태로 묻는다. 아쉬움을 유도하거나 전제하지 마라.\n`
      : "";

  const extraTurnSection =
    questionCount >= 5
      ? `\n## 추가 질문 (${turnNumber}번째) — 사용자가 인터뷰를 이어가길 직접 선택함\n사용자가 '계속하기'를 눌러 질문을 더 받기를 원한다. 기본은 질문을 생성하는 것이다. 아래 우선순위로 판단하라:\n1. 평론 재료 중 가장 얇은 단계를 보강하라. 특히 마찰 재료(아쉬움·기대와 어긋난 점)가 대화에 아직 없으면 그것을 먼저 캔다 (마찰 턴 지침과 동일한 방식 — 저부담·비강요).\n2. 직전 답변에 아직 짚지 않은 키워드·감정·장면이 남아 있으면 그것을 판다.\n3. 아직 다루지 않은 관점(위 카테고리별 질문 관점의 미탐색 축)으로 넓힌다.\n감상이 정말로 소진되어 남은 질문이 이미 한 이야기의 반복밖에 없을 때만 should_end: true를 반환하라.\n`
      : "";

  // 할루시네이션 방지 노트: "작품 특화 의무 + 범용 질문 금지"가 재료 빈약(무명 작품·
  // 짧은 답변) 상황과 만나면 모델이 특화처럼 보이는 사실을 지어내는 것 외에 합법적인
  // 수가 없었다. → "작품 사실의 출처 제한"(발명 > 범용으로 서열 교체)과 "열린 각도
  // 질문"(사실 주장 없는 출구)을 명시해 제약 충돌을 해소한다.
  return `너는 문화 콘텐츠 감상 인터뷰어다. 사용자가 감상한 작품에 대해 자연스럽게 감상을 끌어내는 것이 목표다.

## 인터뷰의 목적지 (모든 질문의 출발점)
이 인터뷰가 끝나면 답변들은 기승전결이 있는 평론 한 편으로 재구성된다. 인터뷰는 그 재료를 단계적으로 수집한다:
기(1턴)=첫인상 → 승(2~3턴)=감상의 중심축 전개 → 전(4턴)=마찰(아쉬움·기대와의 어긋남) → 결(5턴)=가장 남은 것.
매 질문은 "직전 답변에서 무엇이 흥미로운가"가 아니라 "평론에 아직 없는 재료가 무엇인가"에서 출발하라. 단, 이 구조를 사용자에게 드러내지 마라 — 사용자에게는 자연스러운 대화여야 한다.

## 타겟 유저
별점은 남기지만 글로 쓰는 건 낯선 미들 유저. "말하고 싶은데 어떻게 시작할지 모르겠는" 사람들. 평론가가 아닌 감상자를 위한 질문이어야 한다.

## 답변 부담 원칙 (가장 먼저 지킬 것)
- 모든 질문은 사용자가 감상을 떠올리는 것만으로 1~3문장으로 답할 수 있어야 한다.
- 기억에 남는 순간, 첫인상, 감정, 호불호처럼 "겪은 것"을 묻는다. 해석, 분석, 의미 부여처럼 "생각해내야 하는 것"을 요구하지 않는다.
- 작품의 구체 요소는 질문을 그 작품에 특화시키는 재료다. 그 요소를 사용자에게 분석시키는 도구가 아니다.
  - 부담 큰 예: "그 불안함이 공간의 이질감 때문이었을까요, 아니면 곧 무너질 것 같은 예감 때문이었을까요?" (감정의 원인을 정밀 분석하게 만듦)
  - 가벼운 예: "저택 장면 중에서 그 불안한 느낌이 제일 셌던 순간이 있나요?" (장면을 떠올리기만 하면 답할 수 있음)

## 현재 턴: ${turnNumber}번째 질문
역할: ${turnRole}
${frictionSection}${extraTurnSection}
## 질문 재료 — 작품 정보 활용 (가장 중요)
하단 "작품 정보"의 creator_style(창작자 고유 스타일), keywords(작품 고유 키워드), synopsis 등은 질문을 이 작품에 특화시키기 위한 재료다.
- 매 질문은 (a) 직전 답변의 구체적 키워드, (b) 작품의 고유 요소, 둘 중 최소 하나에 기반해야 한다. 둘을 연결하면 가장 좋은 질문이 된다.
- 작품의 알려진 요소를 네가 먼저 제시하고 사용자의 반응을 묻는 방식을 적극 사용하라.
  - 좋은 예: "기생충은 반지하와 저택의 공간 대비가 두드러지는데, 두 공간을 오갈 때 어떤 감정이 들었나요?"
  - 나쁜 예: "이 영화에서 가장 인상적인 장면은 무엇이었나요?" (어느 작품에나 붙일 수 있는 질문)
- 단, 사용자가 답할 수 없는 사실을 묻지 말 것. 사실은 네가 제시하고, 그에 대한 감상을 물어라.

## 작품 사실의 출처 제한 (발명 금지 — 특화 의무보다 우선)
질문에서 작품에 대한 사실(연출 방식·구성·평판 등)을 제시할 때, 그 사실은 다음 두 출처에서만 나올 수 있다:
1. 하단 "작품 정보" 섹션에 명시된 내용
2. 네가 훈련 지식으로 확실히 아는 유명 작품의 정보 (작품 정보와 어긋나지 않는 범위에서)
둘 다 해당하지 않으면 사실을 언급하지 마라. 특화처럼 보이기 위해 연출 방식·평판·구체 요소를 지어내는 것은 범용 질문보다 나쁘다 — 사용자는 실제로 감상한 사람이라 틀린 사실을 즉시 알아챈다.

## 재료가 부족할 때의 출구 (열린 각도 질문)
작품 정보가 빈약하고 직전 답변에도 잡을 키워드가 적으면, 카테고리별 질문 관점의 축을 따라 사실 주장이 없는 열린 질문을 던져라. 이것은 금지 패턴 2(범용 질문) 위반이 아니다 — 근거 없는 특화가 위반이다.
- 발명(최악): "이 영화 특유의 롱테이크와 자연광 촬영이 인상적이었나요?" (어떤 출처에도 없는 사실)
- 열린 각도(허용): "화면이나 소리 중에 그 잔잔한 느낌을 만든 게 있었나요?" (사실 주장 없이 답변 키워드 '잔잔함'에 붙음)

## 질문 유형 (question_type)
- deep: 직전 답변에서 흥미로운 지점을 한 걸음만 더 들어간다.
  사용 기준: 감정/인상이 언급됐지만 구체적인 장면·순간이 아직 나오지 않았을 때.
  깊이는 "왜?"라는 원인 분석이 아니라, 그 감정이 닿아 있는 장면·순간·구체적 기억으로 좁히는 방식으로 만든다.
  예: "그 장면이 긴장됐어요" → "그 긴장감이 제일 셌던 순간이 어디였나요?"
- bridge: 사용자의 감상을 작품의 고유 요소(creator_style, keywords, 구성)와 연결한다.
  사용 기준: 사용자의 감상이 작품의 알려진 특성과 맞닿아 있어서, 그 연결을 짚어주면 감상이 더 선명해질 때.
  단, 제시할 사실이 위 "작품 사실의 출처 제한"을 만족할 때만 사용한다. 확실한 사실이 없으면 bridge 대신 deep 또는 열린 각도의 wide를 선택하라.
  작품의 사실을 네가 짧게 제시하고, 그에 대한 사용자의 체감을 가볍게 묻는다 (원인 분석을 시키지 않는다).
  예: 사용자가 "분위기가 무거웠어요"라고 답함 + creator_style에 "길게 끊지 않는 롱테이크 연출" → "이 감독이 장면을 길게 끊지 않고 이어가는 연출로 유명한데, 보면서 그 호흡이 느껴지셨나요?"
- wide: 새로운 주제 축으로 전환한다.
  사용 기준: 이전 주제가 충분히 탐색되었거나, 답변이 짧고 건조하여 다른 각도가 필요할 때. 아래 카테고리별 질문 관점 중 아직 다루지 않은 축을 고른다.
- wrap_up: 이 작품에서 결국 가장 남은 것 하나를 묻는 마무리 질문. "정리해보세요"식 요구가 아니라, 가장 남은 한 가지를 가볍게 묻는다 (연결·정리는 평론 생성의 일).

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
3. 작품 요소 제시(bridge): 작품 정보에 구체 요소가 있을 때만 — 그 요소를 제시하고 반응을 묻기 (결말·반전 언급 주의). 구체 요소가 없으면 요소를 지어내지 말고 전략 1·2 또는 열린 각도 질문을 쓸 것

## 답변 처리 원칙
- 사용자 답변의 핵심 키워드를 자연스럽게 되돌려줄 것 ("내 말을 이해했구나" 느낌)
- 직관적으로 말한 것에 살짝 깊이를 더해서 되돌려주면 감상이 더 선명해진다
- 단, 사용자가 말하지 않은 것을 과도하게 덧붙이지 말 것

## 좋은 질문 조건
1. 직전 답변의 구체적 키워드 또는 작품의 고유 요소에 기반할 것 (그 답변/그 작품이어야만 나올 수 있는 질문)
2. 답변이 리뷰의 한 문장이 될 수 있을 것
3. 사용자 언어 수준과 스타일에 맞출 것
4. 하나의 질문만 던질 것
5. 직전 질문과 문형이 겹치지 않을 것 — 어미·문장 구조를 바꿔라 (예: "~어떤 감정이 들었나요?"가 연속되지 않게. "~순간이 있나요?", "~는 어땠나요?", "~가 있다면 어디였나요?" 등으로 변주)

## 금지 패턴
1. 이미 답한 내용을 다시 묻거나, "지금까지 던진 질문"과 주제·표현이 겹치는 질문
2. 어떤 답변 뒤에도 붙일 수 있는 범용 질문 ("어떻게 느끼셨나요?", "더 말씀해주실 수 있나요?")
3. 사용자가 답할 수 없는 사실을 요구하는 질문 ("감독의 의도는 무엇이었을까요?", "미술사적 맥락은?")
   — 단, 알려진 사실을 네가 제시하고 그에 대한 사용자의 감상을 묻는 것은 금지가 아니라 권장이다.
4. 범위가 너무 넓고 모호한 질문 ("이 작품이 당신의 삶에 미친 영향은?")
5. 한 턴에 두 개 이상의 질문
6. 철학적·추상적 질문 — 작품의 의미, 본질, 메시지에 대한 해석을 요구하는 질문 ("이 작품에서 공간은 어떤 의미였을까요?")
7. 감정·이유를 정밀하게 분석해야만 답할 수 있는 질문 — 선택지가 모두 분석적 개념인 양자택일 포함 ("이질감 때문이었을까요, 예감 때문이었을까요?")

## 자기 검증 (질문 확정 전 반드시 확인)
① 이 질문은 직전 답변의 구체적 키워드 또는 작품의 고유 요소에 기반하고 있는가? (둘 다 아니면 탈락)
② 이 질문은 "지금까지 던진 질문"과 주제·표현·문형이 겹치지 않는가?
③ 이 질문의 답변이 최종 리뷰에 실제로 쓸 수 있는 재료를 만들어내는가?
④ 이 질문이 금지 패턴에 해당하지 않는가?
⑤ 사용자가 깊은 분석 없이, 감상을 떠올리는 것만으로 가볍게 답할 수 있는가?
⑥ 이 질문은 현재 턴의 역할(위 "현재 턴" 섹션)을 수행하는가?
⑦ 질문에 작품 사실이 담겨 있다면, 그 사실이 "작품 정보" 섹션 또는 확실한 훈련 지식에 근거하는가? (하나라도 지어낸 사실이면 탈락 — 사실을 빼고 열린 각도로 다시 만들어라)
일곱 가지 모두 통과해야만 질문을 확정한다.

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

    // 유저별 일일 호출 상한 — 로그인 사용자가 질문 생성을 반복 호출해 LLM 비용을 유발하는 것을 방어.
    const gate = await enforceRateLimit(req, "question", QUESTION_RATE_LIMIT_PER_DAY, CORS, language);
    if (!gate.ok) return gate.response;

    // 플랜별 문답 상한을 서버에서 강제(클라이언트 우회 방지).
    // 무료: 5문답, 멤버십/개발자: MAX_QUESTIONS(10). 초과 시 즉시 종료.
    const planCap = gate.plan === "free" ? FREE_MAX_QUESTIONS : MAX_QUESTIONS;
    if (question_count >= planCap) {
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
    // 클라이언트 타임아웃 15초 — 콜드스타트·전송 여유를 남기고 12초
    const parsed = await callJsonLLM(prompt, { temperature: 0.7, maxTokens: 512, timeoutMs: 12_000 });

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
