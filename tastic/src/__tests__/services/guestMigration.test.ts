// 게스트 체험 평론의 계정 이전 테스트.
//
// 이전은 works → reviews → 사용량 기록의 3단계이고 한 트랜잭션이 아니다. 중간에 실패하면
// 로컬 보관분을 남겨 다음 로그인에 재시도하는데, 그때 이미 만든 행을 또 만들면 사용자
// 히스토리에 같은 평론이 두 번 쌓인다. 아래 테스트는 그 재시도 경로를 집중적으로 본다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GuestPendingReview } from "../../utils/guestStorage";
// vi.mock 은 vitest 가 import 위로 끌어올리므로 아래 import 는 이미 mock 된 모듈을 받는다.
import { migrateGuestReview } from "../../services/guestMigration";

const {
  mockInvoke,
  mockCreateContent,
  mockSaveVerifiedWork,
  mockCreateReview,
  storage,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockCreateContent: vi.fn(),
  mockSaveVerifiedWork: vi.fn(),
  mockCreateReview: vi.fn(),
  // AsyncStorage 대신 쓰는 인메모리 보관분 — 재시도가 실제로 이전 진행 상태를 읽는지
  // 보려면 저장이 살아있어야 한다.
  storage: { pending: null as GuestPendingReview | null },
}));

vi.mock("../../services/supabase", () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));
vi.mock("../../services/content", () => ({ createContent: mockCreateContent }));
vi.mock("../../services/work", () => ({ saveVerifiedWork: mockSaveVerifiedWork }));
vi.mock("../../services/review", () => ({ createReview: mockCreateReview }));
vi.mock("../../utils/llmLanguage", () => ({ resolveLlmLanguage: () => "ko" }));
vi.mock("../../utils/guestStorage", () => ({
  getGuestPendingReview: vi.fn(async () => storage.pending),
  saveGuestPendingReview: vi.fn(async (r: GuestPendingReview) => {
    storage.pending = r;
  }),
  clearGuestTrial: vi.fn(async () => {
    storage.pending = null;
  }),
}));

const USER_ID = "user-1";

function pendingReview(overrides: Partial<GuestPendingReview> = {}): GuestPendingReview {
  return {
    work: {
      title: "기생충",
      category: "movie",
      creator: "봉준호",
      year: 2019,
      genre: "드라마",
      metadata: {},
      verified: true,
    },
    conversation: [{ role: "user", text: "충격적이었습니다." }],
    title: "계급의 균열",
    body: "봉준호 감독은...",
    savedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.pending = pendingReview();
  mockSaveVerifiedWork.mockResolvedValue({ id: "work-1" });
  mockCreateContent.mockResolvedValue({ id: "work-1" });
  mockCreateReview.mockResolvedValue({ id: "review-1" });
  mockInvoke.mockResolvedValue({ data: { claimed: true }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ────────────────────────────────────────────────────────────
// 회원가입 후 이전
// ────────────────────────────────────────────────────────────

describe("회원가입 후 평론 이전", () => {
  it("작품 → 평론 → 사용량 기록 순으로 이전하고 로컬 보관분을 정리한다", async () => {
    const result = await migrateGuestReview(USER_ID);

    expect(result).toBe(true);
    expect(mockSaveVerifiedWork).toHaveBeenCalledTimes(1);
    expect(mockCreateReview).toHaveBeenCalledWith({
      userId: USER_ID,
      workId: "work-1",
      title: "계급의 균열",
      body: "봉준호 감독은...",
      experienceDate: null,
    });
    expect(mockInvoke).toHaveBeenCalledWith("claim-guest-review", {
      body: { review_id: "review-1", language: "ko" },
    });
    // 이전이 끝나면 보관분이 사라진다 — 다음 로그인에 다시 올라가지 않는다
    expect(storage.pending).toBeNull();
  });

  it("보관 중인 평론이 없으면 아무것도 하지 않는다", async () => {
    storage.pending = null;

    expect(await migrateGuestReview(USER_ID)).toBe(false);
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("수동 입력 작품은 전역 캐시 승격 경로(save-verified-work)를 타지 않는다", async () => {
    storage.pending = pendingReview({
      work: { ...pendingReview().work, verified: false },
    });

    await migrateGuestReview(USER_ID);

    expect(mockSaveVerifiedWork).not.toHaveBeenCalled();
    expect(mockCreateContent).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────
// 재시도 시 중복 방지
// ────────────────────────────────────────────────────────────

describe("이전 재시도 시 중복 방지", () => {
  it("평론 생성에서 실패하면 보관분을 남기고, 재시도는 작품을 다시 만들지 않는다", async () => {
    mockCreateReview.mockRejectedValueOnce(new Error("network"));

    expect(await migrateGuestReview(USER_ID)).toBe(false);
    // 실패해도 사용자가 만든 평론은 지우지 않는다
    expect(storage.pending).not.toBeNull();
    expect(storage.pending?.migratedWorkId).toBe("work-1");

    // 재시도 — 작품은 이미 만들었으므로 건너뛴다
    expect(await migrateGuestReview(USER_ID)).toBe(true);
    expect(mockSaveVerifiedWork).toHaveBeenCalledTimes(1);
    expect(mockCreateReview).toHaveBeenCalledTimes(2);
  });

  it("사용량 기록에서 실패하면 재시도가 평론을 다시 만들지 않는다 — 중복 저장 방지", async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    // 평론 자체는 계정에 올라갔으므로 이전은 성공으로 본다
    expect(await migrateGuestReview(USER_ID)).toBe(true);
    expect(storage.pending?.migratedReviewId).toBe("review-1");
    expect(storage.pending?.claimAttempts).toBe(1);

    await migrateGuestReview(USER_ID);

    // 작품·평론은 첫 시도의 것을 재사용하고, 사용량 기록만 다시 시도한다
    expect(mockSaveVerifiedWork).toHaveBeenCalledTimes(1);
    expect(mockCreateReview).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(storage.pending).toBeNull();
  });

  it("이전에 성공한 뒤 다시 호출해도 평론이 중복되지 않는다", async () => {
    await migrateGuestReview(USER_ID);
    await migrateGuestReview(USER_ID);

    expect(mockCreateReview).toHaveBeenCalledTimes(1);
  });

  it("다른 계정으로 재시도하면 이전 계정에서 만든 행을 재사용하지 않는다", async () => {
    // 수동 입력 작품은 소유자만 읽을 수 있어(works RLS) 남의 work 를 물려주면
    // 히스토리에서 깨진 항목이 된다.
    mockCreateReview.mockRejectedValueOnce(new Error("network"));
    await migrateGuestReview(USER_ID);
    expect(storage.pending?.migratedWorkId).toBe("work-1");

    mockSaveVerifiedWork.mockResolvedValueOnce({ id: "work-2" });
    expect(await migrateGuestReview("user-2")).toBe(true);

    expect(mockSaveVerifiedWork).toHaveBeenCalledTimes(2);
    expect(mockCreateReview).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "user-2", workId: "work-2" })
    );
  });
});

// ────────────────────────────────────────────────────────────
// claim-guest-review 오류 처리
// ────────────────────────────────────────────────────────────

describe("claim-guest-review 오류 처리", () => {
  it("invoke 가 { error } 를 돌려주면 성공으로 취급하지 않고 로깅·재시도한다", async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: "500 boom" } });

    await migrateGuestReview(USER_ID);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("claim-guest-review failed"),
      expect.anything()
    );
    // 보관분이 남아 다음 기회에 사용량 기록을 재시도한다
    expect(storage.pending).not.toBeNull();
  });

  it("200 응답 본문에 error 가 실려와도 실패로 처리한다", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: "usage_record_failed", message: "사용량 기록에 실패했습니다." },
      error: null,
    });

    await migrateGuestReview(USER_ID);

    expect(storage.pending?.claimAttempts).toBe(1);
  });

  it("사용량 기록이 계속 실패해도 재시도 상한에서 멈춰 보관분이 영구히 남지 않는다", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: "always down" } });

    await migrateGuestReview(USER_ID); // 1회차
    await migrateGuestReview(USER_ID); // 2회차
    expect(storage.pending?.claimAttempts).toBe(2);

    await migrateGuestReview(USER_ID); // 3회차 — 상한 도달
    expect(storage.pending).toBeNull();
    // 평론은 첫 시도에서 이미 이전됐으므로 끝까지 한 번만 만들어진다
    expect(mockCreateReview).toHaveBeenCalledTimes(1);
  });
});
