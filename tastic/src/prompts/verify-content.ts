import type { ContentCategory } from "../types/database";

export function buildVerifyContentPrompt(title: string, category: ContentCategory, language: "ko" | "en") {
  const system = `너는 문화 콘텐츠 식별 전문가다.
사용자가 입력한 제목과 카테고리를 바탕으로 실제 존재하는 작품을 찾아라.

규칙:
- 동일 제목의 작품이 여러 개 있으면 최대 5개까지 후보를 반환
- 각 후보에 대해 카테고리별 메타데이터를 포함
- 확신할 수 없는 필드는 null로 반환 (추측 금지)
- 해당 작품을 찾을 수 없으면 빈 배열 반환
- ${language === "ko" ? "한국어" : "English"}로 응답

반드시 아래 JSON 형식으로만 응답하라:
{
  "candidates": [
    {
      "title": "string",
      "original_title": "string | null",
      "creator": "string | null",
      "year": number | null,
      "genre": "string | null",
      "metadata": {},
      "confidence": "high | medium | low"
    }
  ]
}`;

  const user = `제목: ${title}\n카테고리: ${category}`;

  return { system, user };
}
