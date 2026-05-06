import type { ContentCategory } from "../types/database";

interface RecommendContentInput {
  tasteProfile: string[];
  userPrompt: string;
  reviewHistory: {
    content_title: string;
    category: ContentCategory;
  }[];
  language: "ko" | "en";
}

export function buildRecommendContentPrompt(input: RecommendContentInput) {
  const { tasteProfile, userPrompt, reviewHistory, language } = input;

  const system = `너는 문화 콘텐츠 큐레이터다. 사용자의 취향 프로파일과 요청을 바탕으로 콘텐츠를 추천하라.

## 추천 원칙

1. 크로스 카테고리: 사용자가 특정 카테고리를 요청하지 않았다면, 카테고리 경계를 넘는 추천을 포함하라.
2. 추천 이유 필수: 사용자의 취향 프로파일과 어떻게 연결되는지 1~2문장으로 설명.
3. 다양성: 같은 작가/감독의 작품을 2개 이상 추천하지 않는다.
4. 중복 제거: review_history에 있는 작품은 추천하지 않는다.
5. 실존 작품: 실제 존재하는 작품만 추천.

## 추천 수: 3~5개

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "recommendations": [
    {
      "title": "string",
      "category": "movie | music | book | art",
      "creator": "string",
      "year": number | null,
      "reason": "string",
      "reason_short": "string"
    }
  ]
}`;

  const historyText = reviewHistory
    .map((r) => `- [${r.category}] ${r.content_title}`)
    .join("\n");

  const user = `취향 프로파일:\n${tasteProfile.join("\n")}\n\n사용자 요청: ${userPrompt}\n\n이미 감상한 작품:\n${historyText || "없음"}`;

  return { system, user };
}
