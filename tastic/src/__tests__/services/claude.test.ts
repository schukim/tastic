// claude.ts 서비스 테스트
// AI(Edge Function) 호출 레이어의 타임아웃, 에러 파싱, 정상 응답을 검증합니다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  verifyContent,
  generateQuestion,
  generateReview,
  analyzeTaste,
  recommendContent,
} from "../../services/claude";
import { useGuestStore } from "../../stores/guestStore";

// vi.hoisted()로 먼저 선언해야 vi.mock() 팩토리 안에서 참조 가능
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("../../services/supabase", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}));

// 테스트용 더미 데이터
const dummyContent = {
  title: "기생충",
  category: "movie" as const,
  creator: "봉준호",
  year: 2019,
  genre: "드라마",
  metadata: {},
};

const dummyConversation = [
  { role: "interviewer" as const, text: "이 영화의 첫인상은 어땠나요?" },
  { role: "user" as const, text: "충격적이었습니다." },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ────────────────────────────────────────────────────────────
// 1. 정상 응답
// ────────────────────────────────────────────────────────────

describe("정상 응답", () => {
  it("verifyContent: 성공 시 데이터 반환", async () => {
    const expected = { is_valid: true, work_id: "abc-123", title: "기생충" };
    mockInvoke.mockResolvedValueOnce({ data: expected, error: null });

    const result = await verifyContent({ title: "기생충", category: "movie", language: "ko" });
    expect(result).toEqual(expected);
    expect(mockInvoke).toHaveBeenCalledWith("verify-content", expect.any(Object));
  });

  it("generateQuestion: 성공 시 질문 반환", async () => {
    const expected = { question: "주인공에게 공감했나요?", question_type: "deep", topic_label: "감정" };
    mockInvoke.mockResolvedValueOnce({ data: expected, error: null });

    const result = await generateQuestion({
      content: dummyContent,
      conversation_history: dummyConversation,
      question_count: 1,
      language: "ko",
    });
    expect(result.question).toBe("주인공에게 공감했나요?");
  });

  it("generateReview: 성공 시 평론 텍스트 반환", async () => {
    const expected = { suggested_title: "계급의 균열", review_text: "봉준호 감독은..." };
    mockInvoke.mockResolvedValueOnce({ data: expected, error: null });

    const result = await generateReview({
      content: dummyContent,
      conversation_history: dummyConversation,
      language: "ko",
    });
    expect(result.review_text).toBe("봉준호 감독은...");
  });
});

// ────────────────────────────────────────────────────────────
// 2. 타임아웃
// ────────────────────────────────────────────────────────────

describe("타임아웃 처리", () => {
  it("verifyContent: 35초 초과 시 타임아웃 에러", async () => {
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const resultPromise = verifyContent({ title: "기생충", category: "movie", language: "ko" });
    // rejection handler를 먼저 붙인 뒤 타이머를 진행해야 unhandled rejection 경고 없음
    const assertion = expect(resultPromise).rejects.toThrow("요청 시간이 초과되었습니다.");
    await vi.advanceTimersByTimeAsync(35_001);
    await assertion;
  });

  it("generateQuestion: 15초 초과 시 타임아웃 에러", async () => {
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const resultPromise = generateQuestion({
      content: dummyContent,
      conversation_history: dummyConversation,
      question_count: 1,
      language: "ko",
    });
    const assertion = expect(resultPromise).rejects.toThrow("요청 시간이 초과되었습니다.");
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });

  it("generateReview: 30초 초과 시 타임아웃 에러", async () => {
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const resultPromise = generateReview({
      content: dummyContent,
      conversation_history: dummyConversation,
      language: "ko",
    });
    const assertion = expect(resultPromise).rejects.toThrow("요청 시간이 초과되었습니다.");
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it("analyzeTaste: 30초 초과 시 타임아웃 에러", async () => {
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const resultPromise = analyzeTaste({ language: "ko" });
    const assertion = expect(resultPromise).rejects.toThrow("요청 시간이 초과되었습니다.");
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it("recommendContent: 35초 초과 시 타임아웃 에러", async () => {
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const resultPromise = recommendContent({ user_prompt: "잔잔한 영화", language: "ko" });
    const assertion = expect(resultPromise).rejects.toThrow("요청 시간이 초과되었습니다.");
    await vi.advanceTimersByTimeAsync(35_001);
    await assertion;
  });

  it("29초에는 타임아웃 발생 안 함 (generateReview)", async () => {
    const expected = { suggested_title: "제목", review_text: "내용" };
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: expected, error: null }), 29_000)
      )
    );

    const resultPromise = generateReview({
      content: dummyContent,
      conversation_history: dummyConversation,
      language: "ko",
    });
    await vi.advanceTimersByTimeAsync(29_000);

    const result = await resultPromise;
    expect(result.review_text).toBe("내용");
  });
});

// ────────────────────────────────────────────────────────────
// 3. 에러 파싱
// ────────────────────────────────────────────────────────────

describe("에러 파싱", () => {
  it("Supabase error 객체 → error.message로 에러 throw", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: "Function not found" },
    });

    await expect(
      verifyContent({ title: "기생충", category: "movie", language: "ko" })
    ).rejects.toThrow("Function not found");
  });

  it("FunctionsHttpError: context.json에서 message 파싱", async () => {
    const jsonBody = { error: true, message: "콘텐츠를 확인할 수 없습니다." };
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => jsonBody },
      },
    });

    await expect(
      verifyContent({ title: "기생충", category: "movie", language: "ko" })
    ).rejects.toThrow("콘텐츠를 확인할 수 없습니다.");
  });

  it("data.error 필드가 true이면 data.message로 에러 throw", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: true, message: "AI 서버 오류가 발생했습니다." },
      error: null,
    });

    await expect(
      generateQuestion({
        content: dummyContent,
        conversation_history: dummyConversation,
        question_count: 1,
        language: "ko",
      })
    ).rejects.toThrow("AI 서버 오류가 발생했습니다.");
  });

  it("context.json 파싱 실패 시 원래 error.message 사용", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "원본 에러 메시지",
        context: {
          json: async () => { throw new Error("원본 에러 메시지"); },
        },
      },
    });

    await expect(
      verifyContent({ title: "기생충", category: "movie", language: "ko" })
    ).rejects.toThrow("원본 에러 메시지");
  });
});

// ── 게스트 헤더 ──
// 게스트(비로그인 체험)는 JWT 가 없어 서버가 식별할 수 없으므로 기기 UUID 를
// x-guest-id 로 보낸다. 로그인 상태에서 이 헤더가 새어나가면 서버가 플랜 한도 대신
// 게스트 한도를 태우게 되므로(우회 경로), 절대 붙지 않아야 한다.
describe("게스트 헤더(x-guest-id)", () => {
  const GUEST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

  beforeEach(() => {
    useGuestStore.setState({ isGuest: false, guestId: null });
  });

  it("게스트 상태면 verify-content 에 x-guest-id 를 붙인다", async () => {
    useGuestStore.setState({ isGuest: true, guestId: GUEST_ID });
    mockInvoke.mockResolvedValueOnce({ data: { candidates: [] }, error: null });

    await verifyContent({ title: "기생충", category: "movie", language: "ko" });

    expect(mockInvoke).toHaveBeenCalledWith(
      "verify-content",
      expect.objectContaining({ headers: { "x-guest-id": GUEST_ID } })
    );
  });

  it("로그인 상태(isGuest=false)면 헤더를 붙이지 않는다", async () => {
    useGuestStore.setState({ isGuest: false, guestId: GUEST_ID });
    mockInvoke.mockResolvedValueOnce({ data: { candidates: [] }, error: null });

    await verifyContent({ title: "기생충", category: "movie", language: "ko" });

    expect(mockInvoke.mock.calls[0][1]).not.toHaveProperty("headers");
  });

  it("게스트지만 guestId 가 아직 로드되지 않았으면 헤더를 붙이지 않는다", async () => {
    useGuestStore.setState({ isGuest: true, guestId: null });
    mockInvoke.mockResolvedValueOnce({ data: { candidates: [] }, error: null });

    await verifyContent({ title: "기생충", category: "movie", language: "ko" });

    expect(mockInvoke.mock.calls[0][1]).not.toHaveProperty("headers");
  });

  it("게스트여도 추천(recommend-content)에는 헤더를 붙이지 않는다 — 계정 전용 기능", async () => {
    useGuestStore.setState({ isGuest: true, guestId: GUEST_ID });
    mockInvoke.mockResolvedValueOnce({ data: { recommendations: [] }, error: null });

    await recommendContent({ user_prompt: "요즘 볼만한 영화", language: "ko" });

    expect(mockInvoke.mock.calls[0][1]).not.toHaveProperty("headers");
  });
});
