import i18n from "../i18n";

export type LlmLanguage = "ko" | "en";

/**
 * LLM 요청에 실어 보낼 언어를 정한다.
 *
 * 로그인 사용자는 계정 설정(users.language)이 진실이다 — 기기 로케일이 영어여도
 * 마이페이지에서 한국어를 고른 사용자에게는 한국어로 응답해야 한다.
 *
 * 게스트(비로그인 체험)는 계정이 없어 users 행 자체가 없다. 이때 "ko" 로 굳어버리면
 * 영어 사용자가 작품 검색·질문·평론을 전부 한국어로 받게 된다 — 체험이 회원가입 퍼널인데
 * 첫인상이 읽을 수 없는 언어가 되는 셈. 그래서 현재 i18n 언어(기기 로케일 기반,
 * 인트로 화면이 쓰는 것과 동일한 값)로 폴백한다.
 */
export function resolveLlmLanguage(user?: { language?: string | null } | null): LlmLanguage {
  const account = user?.language;
  if (account === "ko" || account === "en") return account;

  return normalizeLanguage(i18n.language);
}

/** i18next 는 "en-US" 같은 지역 태그를 줄 수 있어 앞 두 글자로 판별한다. */
export function normalizeLanguage(tag: string | undefined | null): LlmLanguage {
  return tag?.toLowerCase().startsWith("en") ? "en" : "ko";
}
