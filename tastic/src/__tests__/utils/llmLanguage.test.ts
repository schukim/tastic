// LLM 요청 언어 결정 테스트.
//
// 게스트(비로그인 체험)는 users 행이 없어 계정 언어를 읽을 수 없다. 예전 코드
// (user?.language ?? "ko")는 이 경우 무조건 한국어로 굳어, 영어 사용자가 작품 검색·질문·
// 평론을 전부 한국어로 받았다 — 체험이 회원가입 퍼널인데 첫인상이 못 읽는 언어가 된다.
import { describe, it, expect, beforeEach } from "vitest";
import i18n from "../../i18n";
import { resolveLlmLanguage, normalizeLanguage } from "../../utils/llmLanguage";

beforeEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("로그인 사용자", () => {
  it("계정 설정 언어를 따른다", () => {
    expect(resolveLlmLanguage({ language: "en" })).toBe("en");
    expect(resolveLlmLanguage({ language: "ko" })).toBe("ko");
  });

  it("기기 언어가 영어여도 계정이 한국어면 한국어다 — 계정 설정이 진실이다", async () => {
    await i18n.changeLanguage("en");
    expect(resolveLlmLanguage({ language: "ko" })).toBe("ko");
  });

  it("계정 언어가 알 수 없는 값이면 기기 언어로 폴백한다", async () => {
    await i18n.changeLanguage("en");
    expect(resolveLlmLanguage({ language: "fr" })).toBe("en");
  });
});

describe("게스트(계정 없음)", () => {
  it("기기 언어가 영어면 영어로 요청한다", async () => {
    await i18n.changeLanguage("en");
    expect(resolveLlmLanguage(null)).toBe("en");
    expect(resolveLlmLanguage()).toBe("en");
  });

  it("기기 언어가 한국어면 한국어로 요청한다", () => {
    expect(resolveLlmLanguage(null)).toBe("ko");
  });

  it("en-US 같은 지역 태그도 영어로 인식한다", async () => {
    await i18n.changeLanguage("en-US");
    expect(resolveLlmLanguage(null)).toBe("en");
  });
});

describe("normalizeLanguage", () => {
  it("영어 계열만 en, 나머지는 ko 로 떨어뜨린다", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("en-GB")).toBe("en");
    expect(normalizeLanguage("EN")).toBe("en");
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage(undefined)).toBe("ko");
    expect(normalizeLanguage(null)).toBe("ko");
  });
});
