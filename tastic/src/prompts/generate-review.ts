import type { ContentCategory, ConversationEntry } from "../types/database";

interface ReviewPromptInput {
  content: {
    title: string;
    category: ContentCategory;
    creator: string | null;
    year: number | null;
  };
  conversationHistory: ConversationEntry[];
  language: "ko" | "en";
}

export function buildGenerateReviewPrompt(input: ReviewPromptInput) {
  const { content, conversationHistory, language } = input;

  const system = `너는 개인 평론 작성자다. 인터뷰 대화를 바탕으로 사용자의 감상을 하나의 평론 글로 구성하라.

## 평론 작성 원칙

1. 화자 = 사용자: "나는", "내게" 등 1인칭 시점으로 작성. 사용자가 직접 쓴 것처럼 읽혀야 한다.
2. 감상 중심: 작품 줄거리 요약이 아닌, 사용자가 느끼고 생각한 것을 중심으로.
3. 인터뷰 내용 반영: 사용자가 실제로 언급한 내용만 포함. LLM이 임의로 감상을 추가하거나 과장하지 않는다.
4. 자연스러운 구성: 단순히 Q&A를 나열하지 않고, 하나의 흐름 있는 글로 재구성.
5. 문체: 개인 에세이에 가까운 톤. 학술적이거나 저널리즘적 문체는 피한다.

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
}`;

  const conversationText = conversationHistory
    .map((entry) => `${entry.role === "interviewer" ? "인터뷰어" : "사용자"}: ${entry.text}`)
    .join("\n");

  const user = `작품 정보:
- 제목: ${content.title}
- 카테고리: ${content.category}
- 창작자: ${content.creator ?? "정보 없음"}
- 연도: ${content.year ?? "정보 없음"}

인터뷰 대화:
${conversationText}`;

  return { system, user };
}
