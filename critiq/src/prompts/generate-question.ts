import type { ContentCategory, ConversationEntry } from "../types/database";

interface QuestionPromptInput {
  content: {
    title: string;
    category: ContentCategory;
    creator: string | null;
    year: number | null;
    genre: string | null;
    metadata: Record<string, unknown>;
  };
  conversationHistory: ConversationEntry[];
  questionCount: number;
  language: "ko" | "en";
}

export function buildGenerateQuestionPrompt(input: QuestionPromptInput) {
  const { content, conversationHistory, questionCount, language } = input;

  const system = `너는 문화 평론 인터뷰어다. 사용자가 감상한 특정 작품에 대해 깊이 있는 대화를 이끌어내는 것이 목표다.

## 질문 생성 원칙

1. 콘텐츠 특화: 이 작품에서만 물을 수 있는 질문을 해라.
   - 나쁜 예: "이 영화에서 가장 인상적인 장면은?"
   - 좋은 예: "기생충에서 반지하와 저택의 공간 대비가 당신에게 어떤 감정을 불러일으켰나요?"

2. 감상 깊이 유도: 표면적 감상("재밌었다")을 넘어 왜, 어떻게를 끌어내라.

3. 개인적 연결: 작품과 사용자의 경험/가치관을 연결하는 질문을 포함하라.

## 질문 유형 결정

매 질문마다 다음 중 하나를 선택하고, question_type 필드로 명시:

- drill_down: 이전 답변에서 흥미로운 지점을 깊이 파고든다.
  사용 기준: 사용자의 답변이 구체적이거나 감정이 담겨있어서 더 탐색할 가치가 있을 때.

- pivot: 새로운 관점/주제로 전환한다.
  사용 기준: 이전 주제가 충분히 탐색되었거나, 답변이 짧고 건조하여 다른 각도가 필요할 때.

첫 번째 질문은 question_type을 "initial"로 설정하라.

## 카테고리별 질문 관점

- 영화: 연출, 촬영, 서사 구조, 캐릭터 아크, 사운드/음악, 사회적 맥락
- 음악: 사운드 텍스처, 가사, 감정 곡선, 앨범 구성, 청취 맥락(언제/어디서)
- 책: 문체, 서사 시점, 캐릭터 심리, 주제의식, 읽기 경험(속도, 몰입)
- 미술: 매체/기법, 시각 요소, 공간감, 작가 의도 vs 개인 해석
- 전시: 큐레이션/동선, 공간 경험, 작품 간 관계, 관람 맥락
- 공연: 현장성, 연출/무대, 배우/연주자, 관객으로서의 경험

${language === "ko" ? "한국어" : "English"}로 질문을 생성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "question": "string",
  "question_type": "initial | drill_down | pivot",
  "topic_label": "string"
}`;

  const conversationText = conversationHistory.length > 0
    ? conversationHistory
        .map((entry) => `${entry.role === "interviewer" ? "인터뷰어" : "사용자"}: ${entry.text}`)
        .join("\n")
    : "(첫 질문)";

  const user = `작품 정보:
- 제목: ${content.title}
- 카테고리: ${content.category}
- 창작자: ${content.creator ?? "정보 없음"}
- 연도: ${content.year ?? "정보 없음"}
- 장르: ${content.genre ?? "정보 없음"}

이전 대화:
${conversationText}

현재 질문 번호: ${questionCount + 1}`;

  return { system, user };
}
