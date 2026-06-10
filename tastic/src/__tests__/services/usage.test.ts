// usage.ts 플랜별 사용량 사전 체크 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockGte } = vi.hoisted(() => {
  const mockGte = vi.fn();
  const mockEqAction = vi.fn(() => ({ gte: mockGte }));
  const mockEqUser = vi.fn(() => ({ eq: mockEqAction }));
  const mockSelect = vi.fn(() => ({ eq: mockEqUser }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockFrom, mockGte };
});

vi.mock("../../services/supabase", () => ({
  supabase: { from: mockFrom },
}));

import { checkUsageLimit } from "../../services/usage";

describe("checkUsageLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
