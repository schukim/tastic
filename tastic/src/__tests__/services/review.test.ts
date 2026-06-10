// review.ts 서비스 테스트
// DB CRUD 함수의 에러 핸들링, 한국어 에러 메시지, 날짜 계산을 검증합니다.
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted()로 먼저 선언해야 vi.mock() 팩토리 안에서 참조 가능
const { mocks, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();
  const mockEq = vi.fn();
  const mockGte = vi.fn();
  const mockLte = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockSelect = vi.fn();

  const resetChain = () => {
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq, select: mockSelect });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ order: mockOrder, gte: mockGte, single: mockSingle, select: mockSelect });
    mockGte.mockReturnValue({ lte: mockLte });
    mockLte.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ single: mockSingle });
  };

  resetChain();

  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }));

  return {
    mocks: { mockSingle, mockOrder, mockEq, mockGte, mockLte, mockInsert, mockUpdate, mockDelete, mockSelect, resetChain },
    mockFrom,
  };
});

vi.mock("../../services/supabase", () => ({
  supabase: { from: mockFrom },
}));

import {
  createReview,
  fetchReviews,
  fetchReviewsByMonth,
  deleteReview,
  updateReview,
  createInterview,
  updateInterview,
} from "../../services/review";

const dummyReview = {
  id: "review-1",
  user_id: "user-1",
  work_id: "work-1",
  title: "계급의 이야기",
  body: "봉준호 감독은...",
  experience_date: "2024-01-15",
  created_at: "2024-01-16T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resetChain();
  mockFrom.mockReturnValue({
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
  });
});

// ────────────────────────────────────────────────────────────
// createReview
// ────────────────────────────────────────────────────────────

describe("createReview", () => {
  it("성공 시 Review 객체 반환", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: dummyReview, error: null });

    const result = await createReview({
      userId: "user-1",
      workId: "work-1",
      title: "계급의 이야기",
      body: "봉준호 감독은...",
      experienceDate: "2024-01-15",
    });

    expect(result).toEqual(dummyReview);
    expect(mockFrom).toHaveBeenCalledWith("reviews");
  });

  it("실패 시 한국어 에러 메시지 throw", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: null, error: { message: "duplicate key" } });

    await expect(
      createReview({ userId: "user-1", workId: "work-1", title: null, body: "내용", experienceDate: null })
    ).rejects.toThrow("평론 저장에 실패했습니다: duplicate key");
  });

  it("title이 null이어도 저장 가능", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: { ...dummyReview, title: null }, error: null });

    const result = await createReview({
      userId: "user-1", workId: "work-1", title: null, body: "내용", experienceDate: null,
    });
    expect(result.title).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// fetchReviews
// ────────────────────────────────────────────────────────────

describe("fetchReviews", () => {
  it("성공 시 배열 반환", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: [dummyReview], error: null });

    const result = await fetchReviews("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("review-1");
  });

  it("데이터 없으면 빈 배열 반환 (null 처리)", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: null, error: null });

    const result = await fetchReviews("user-1");
    expect(result).toEqual([]);
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });

    await expect(fetchReviews("user-1")).rejects.toThrow("평론 조회에 실패했습니다: permission denied");
  });
});

// ────────────────────────────────────────────────────────────
// fetchReviewsByMonth — 날짜 경계 검증
// ────────────────────────────────────────────────────────────

describe("fetchReviewsByMonth 날짜 계산", () => {
  // 구현이 로컬 타임존 기준 월 경계를 ISO(UTC)로 직렬화하므로,
  // ISO 문자열을 다시 로컬 날짜로 되돌려 비교한다 (타임존 무관 검증)
  const localYMD = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  it("1월: 1월 1일~1월 31일 범위로 쿼리", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await fetchReviewsByMonth("user-1", 2024, 1);

    const gteCall = mocks.mockGte.mock.calls[0];
    expect(gteCall[0]).toBe("created_at");
    expect(localYMD(gteCall[1])).toBe("2024-01-01");

    const lteCall = mocks.mockLte.mock.calls[0];
    expect(lteCall[0]).toBe("created_at");
    expect(localYMD(lteCall[1])).toBe("2024-01-31");
  });

  it("2월(윤년 2024): 2월 1일~2월 29일 범위로 쿼리", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await fetchReviewsByMonth("user-1", 2024, 2);

    const lteCall = mocks.mockLte.mock.calls[0];
    expect(localYMD(lteCall[1])).toBe("2024-02-29");
  });

  it("2월(평년 2023): 2월 1일~2월 28일 범위로 쿼리", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await fetchReviewsByMonth("user-1", 2023, 2);

    const lteCall = mocks.mockLte.mock.calls[0];
    expect(localYMD(lteCall[1])).toBe("2023-02-28");
  });

  it("12월: 12월 1일~12월 31일 범위로 쿼리", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: [], error: null });

    await fetchReviewsByMonth("user-1", 2024, 12);

    const gteCall = mocks.mockGte.mock.calls[0];
    expect(localYMD(gteCall[1])).toBe("2024-12-01");

    const lteCall = mocks.mockLte.mock.calls[0];
    expect(localYMD(lteCall[1])).toBe("2024-12-31");
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockOrder.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });

    await expect(fetchReviewsByMonth("user-1", 2024, 3)).rejects.toThrow(
      "월별 평론 조회에 실패했습니다: timeout"
    );
  });
});

// ────────────────────────────────────────────────────────────
// deleteReview
// ────────────────────────────────────────────────────────────

describe("deleteReview", () => {
  it("성공 시 아무것도 반환하지 않음 (void)", async () => {
    mocks.mockEq.mockResolvedValueOnce({ error: null });

    await expect(deleteReview("review-1")).resolves.toBeUndefined();
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockEq.mockResolvedValueOnce({ error: { message: "row not found" } });

    await expect(deleteReview("review-1")).rejects.toThrow("평론 삭제에 실패했습니다: row not found");
  });
});

// ────────────────────────────────────────────────────────────
// updateReview
// ────────────────────────────────────────────────────────────

describe("updateReview", () => {
  it("body만 업데이트 시 title 필드 없음", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: dummyReview, error: null });

    await updateReview("review-1", "수정된 내용");

    const updateCallArg = mocks.mockUpdate.mock.calls[0][0];
    expect(updateCallArg).toHaveProperty("body", "수정된 내용");
    expect(updateCallArg).not.toHaveProperty("title");
  });

  it("title 함께 업데이트 시 title 포함", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: dummyReview, error: null });

    await updateReview("review-1", "수정된 내용", "새 제목");

    const updateCallArg = mocks.mockUpdate.mock.calls[0][0];
    expect(updateCallArg).toHaveProperty("title", "새 제목");
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not authorized" } });

    await expect(updateReview("review-1", "내용")).rejects.toThrow(
      "평론 수정에 실패했습니다: not authorized"
    );
  });
});

// ────────────────────────────────────────────────────────────
// updateInterview
// ────────────────────────────────────────────────────────────

describe("updateInterview", () => {
  it("status 없이 호출 시 conversation·question_count만 전달", async () => {
    mocks.mockEq.mockResolvedValueOnce({ error: null });

    await updateInterview("interview-1", [], 3);

    const updateCallArg = mocks.mockUpdate.mock.calls[0][0];
    expect(updateCallArg).toHaveProperty("conversation");
    expect(updateCallArg).toHaveProperty("question_count", 3);
    expect(updateCallArg).not.toHaveProperty("status");
  });

  it("status 전달 시 status 포함", async () => {
    mocks.mockEq.mockResolvedValueOnce({ error: null });

    await updateInterview("interview-1", [], 5, "completed");

    const updateCallArg = mocks.mockUpdate.mock.calls[0][0];
    expect(updateCallArg).toHaveProperty("status", "completed");
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockEq.mockResolvedValueOnce({ error: { message: "connection reset" } });

    await expect(updateInterview("interview-1", [], 2)).rejects.toThrow(
      "인터뷰 업데이트에 실패했습니다: connection reset"
    );
  });
});

// ────────────────────────────────────────────────────────────
// createInterview
// ────────────────────────────────────────────────────────────

describe("createInterview", () => {
  it("성공 시 Interview 객체 반환", async () => {
    const dummyInterview = {
      id: "interview-1",
      user_id: "user-1",
      work_id: "work-1",
      conversation: [],
      question_count: 0,
      status: "in_progress",
    };
    mocks.mockSingle.mockResolvedValueOnce({ data: dummyInterview, error: null });

    const result = await createInterview({ userId: "user-1", workId: "work-1" });
    expect(result.status).toBe("in_progress");
    expect(result.question_count).toBe(0);
  });

  it("에러 시 한국어 메시지 throw", async () => {
    mocks.mockSingle.mockResolvedValueOnce({ data: null, error: { message: "foreign key violation" } });

    await expect(createInterview({ userId: "user-1", workId: "work-1" })).rejects.toThrow(
      "인터뷰 생성에 실패했습니다: foreign key violation"
    );
  });
});
