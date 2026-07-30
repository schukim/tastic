// 인터뷰 첫 질문 선택 테스트.
//
// 첫 질문만 LLM 을 거치지 않고 클라이언트에서 고른다(비용·지연 절감). 그래서 언어 분기도
// 클라이언트 책임이다 — 게스트 영어 사용자가 인터뷰 첫 화면부터 한국어를 만나면
// 체험이 거기서 끝난다.
import { describe, it, expect } from "vitest";
import { getFirstQuestion } from "../../prompts/firstQuestions";
import type { ContentCategory } from "../../types/database";

const CATEGORIES: ContentCategory[] = ["movie", "series", "book", "art", "music"];

// 한글 음절이 하나도 없으면 영어 문장으로 본다
const hasHangul = (s: string) => /[가-힣]/.test(s);

describe("한국어 첫 질문", () => {
  it("모든 카테고리에서 한국어 질문을 돌려준다", () => {
    for (const category of CATEGORIES) {
      const q = getFirstQuestion(category, {}, "ko");
      expect(q.length).toBeGreaterThan(0);
      expect(hasHangul(q)).toBe(true);
    }
  });

  it("language 를 생략하면 한국어가 기본이다", () => {
    expect(hasHangul(getFirstQuestion("movie", {}))).toBe(true);
  });

  it("작품 특화 캐시(first_questions)가 있으면 그것을 쓴다", () => {
    const cached = "기생충에서 반지하와 저택을 오갈 때 어떤 감정이 들었나요?";
    expect(getFirstQuestion("movie", { first_questions: [cached] }, "ko")).toBe(cached);
  });
});

describe("영어 첫 질문", () => {
  it("모든 카테고리에서 영어 질문을 돌려준다", () => {
    for (const category of CATEGORIES) {
      const q = getFirstQuestion(category, {}, "en");
      expect(q.length).toBeGreaterThan(0);
      expect(hasHangul(q)).toBe(false);
    }
  });

  it("음악은 곡/앨범을 구분해 영어 질문을 돌려준다", () => {
    const song = getFirstQuestion("music", { music_type: "song" }, "en");
    const album = getFirstQuestion("music", { music_type: "album" }, "en");
    expect(hasHangul(song)).toBe(false);
    expect(hasHangul(album)).toBe(false);
  });

  it("한국어로 캐싱된 작품 특화 질문은 무시하고 영어 템플릿을 쓴다", () => {
    // metadata.first_questions 는 works 행에 붙는 전역 캐시이고 서버가 한국어로만 생성한다
    // (save-verified-work). 영어 사용자에게 그대로 내보내면 첫 질문이 한국어로 뜬다.
    const cached = "기생충에서 반지하와 저택을 오갈 때 어떤 감정이 들었나요?";
    const q = getFirstQuestion("movie", { first_questions: [cached] }, "en");

    expect(q).not.toBe(cached);
    expect(hasHangul(q)).toBe(false);
  });
});
