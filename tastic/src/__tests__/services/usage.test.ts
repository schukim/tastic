// usage.ts 플랜별 사용량 사전 체크 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

import { checkUsageLimit, getRemainingGrace } from "../../services/usage";

// usage_logs 조회는 두 종류다:
//   - 생애 누적: from().select().eq(user).eq(action)          → mockLifetime
//   - 기간 누적: from().select().eq(user).eq(action).gte(...)  → mockGte
// eq(action) 결과가 thenable 이면서 gte 도 갖도록 해 둘 다 흉내낸다.
type CountResult = { count: number | null; error: { message: string } | null };

const { mockFrom, mockGte, mockLifetime } = vi.hoisted(() => {
  const mockGte = vi.fn();
  const mockLifetime = vi.fn((): CountResult => ({ count: 0, error: null }));
  const mockEqAction = vi.fn(() => ({
    gte: mockGte,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(mockLifetime()).then(resolve, reject),
  }));
  const mockEqUser = vi.fn(() => ({ eq: mockEqAction }));
  const mockSelect = vi.fn(() => ({ eq: mockEqUser }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockFrom, mockGte, mockLifetime };
});

vi.mock("../../services/supabase", () => ({
  supabase: { from: mockFrom },
}));

describe("checkUsageLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본값: 그레이스 소진 상태 — 기간 한도 검사가 돌도록 한다
    mockLifetime.mockReturnValue({ count: 3, error: null });
  });

  it("멤버십 플랜은 조회 없이 항상 허용한다", async () => {
    const allowed = await checkUsageLimit("user-1", "membership", "review");
    expect(allowed).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("developer 플랜은 조회 없이 항상 허용한다", async () => {
    const allowed = await checkUsageLimit("user-1", "developer", "review");
    expect(allowed).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("무료 플랜: 오늘 사용 기록이 없으면 허용한다", async () => {
    mockGte.mockResolvedValue({ count: 0, error: null });
    const allowed = await checkUsageLimit("user-1", "free", "review");
    expect(allowed).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("usage_logs");
  });

  it("무료 플랜: 한도(1회)에 도달하면 차단한다", async () => {
    mockGte.mockResolvedValue({ count: 1, error: null });
    const allowed = await checkUsageLimit("user-1", "free", "review");
    expect(allowed).toBe(false);
  });

  it("무료 플랜: 분석은 주 단위로 카운트한다", async () => {
    mockGte.mockResolvedValue({ count: 1, error: null });
    const allowed = await checkUsageLimit("user-1", "free", "analysis");
    expect(allowed).toBe(false);
  });

  it("조회 실패 시 차단하지 않는다 (서버가 최종 검증)", async () => {
    mockGte.mockResolvedValue({ count: null, error: { message: "boom" } });
    const allowed = await checkUsageLimit("user-1", "free", "recommendation");
    expect(allowed).toBe(true);
  });

  it("온보딩 그레이스: 생애 3편 미만이면 오늘 한도를 넘겨도 허용한다", async () => {
    mockLifetime.mockReturnValue({ count: 2, error: null });
    mockGte.mockResolvedValue({ count: 1, error: null });
    const allowed = await checkUsageLimit("user-1", "free", "review");
    expect(allowed).toBe(true);
    // 그레이스로 통과했으므로 기간 조회까지 가지 않는다
    expect(mockGte).not.toHaveBeenCalled();
  });

  it("온보딩 그레이스: 3편을 채우면 다시 일일 한도를 적용한다", async () => {
    mockLifetime.mockReturnValue({ count: 3, error: null });
    mockGte.mockResolvedValue({ count: 1, error: null });
    const allowed = await checkUsageLimit("user-1", "free", "review");
    expect(allowed).toBe(false);
    expect(mockGte).toHaveBeenCalled();
  });

  it("온보딩 그레이스는 추천·분석에는 적용되지 않는다", async () => {
    mockLifetime.mockReturnValue({ count: 0, error: null });
    mockGte.mockResolvedValue({ count: 1, error: null });
    expect(await checkUsageLimit("user-1", "free", "recommendation")).toBe(false);
    expect(await checkUsageLimit("user-1", "free", "analysis")).toBe(false);
  });

  it("생애 누적 조회 실패 시 차단하지 않는다", async () => {
    mockLifetime.mockReturnValue({ count: null, error: { message: "boom" } });
    const allowed = await checkUsageLimit("user-1", "free", "review");
    expect(allowed).toBe(true);
    expect(mockGte).not.toHaveBeenCalled();
  });
});

describe("getRemainingGrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("아직 한 편도 쓰지 않았으면 3을 돌려준다", async () => {
    mockLifetime.mockReturnValue({ count: 0, error: null });
    expect(await getRemainingGrace("user-1", "free", "review")).toBe(3);
  });

  it("소진했으면 0을 돌려준다 (음수가 되지 않는다)", async () => {
    mockLifetime.mockReturnValue({ count: 7, error: null });
    expect(await getRemainingGrace("user-1", "free", "review")).toBe(0);
  });

  it("멤버십·그레이스 없는 액션·조회 실패는 0", async () => {
    mockLifetime.mockReturnValue({ count: 0, error: null });
    expect(await getRemainingGrace("user-1", "membership", "review")).toBe(0);
    expect(await getRemainingGrace("user-1", "free", "analysis")).toBe(0);
    mockLifetime.mockReturnValue({ count: null, error: { message: "boom" } });
    expect(await getRemainingGrace("user-1", "free", "review")).toBe(0);
  });
});
