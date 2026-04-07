import type { ContentCategory } from "../types/database";

interface AnalyzeTasteInput {
  reviews: {
    content_title: string;
    category: ContentCategory;
    review_text: string;
    created_at: string;
  }[];
  previousProfile: string | null;
  language: "ko" | "en";
}

export function buildAnalyzeTastePrompt(input: AnalyzeTasteInput) {
  const { reviews, previousProfile, language } = input;

  const system = `너는 문화 취향 분석가다. 사용자가 작성한 평론들을 읽고, 그 사람의 감상 패턴과 취향을 정성적으로 분석하라.

## 분석 원칙

1. 서술형 문장: "· 해체된 구조와 서사를 통해 표현의 새로운 가능성을 탐색합니다."와 같은 형태. 키워드 태그나 수치 나열 금지.
2. 근거 기반: 실제 평론에서 드러난 패턴만 언급. 추측하지 않는다.
3. 크로스 카테고리 통찰: 영화와 음악에서 공통적으로 드러나는 성향 등을 연결.
4. 구체적 표현: "다양한 장르를 좋아합니다" 같은 모호한 문장 금지.
5. 변화 감지: previous_profile이 있으면 이전 분석과 비교하여 변화된 부분을 반영.

${language === "ko" ? "한국어" : "English"}로 작성하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "profile_sentences": ["string", ...],
  "recommendation_hook": "string"
}`;

  const reviewsText = reviews
    .map((r) => `[${r.category}] ${r.content_title}\n${r.review_text}`)
    .join("\n\n---\n\n");

  const user = `평론 목록:\n${reviewsText}\n\n이전 분석 결과: ${previousProfile ?? "없음"}`;

  return { system, user };
}
