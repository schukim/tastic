// subscription.ts — 스토어 실제 구독 상태와 DB users.plan 정합화(다운그레이드) 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

import { reconcileSubscription } from "../../services/subscription";
import { useAuthStore } from "../../stores/authStore";
import { fetchEntitlementActive } from "../../services/purchases";
import { supabase } from "../../services/supabase";
import type { User } from "../../types/database";

vi.mock("../../services/purchases", () => ({
  fetchEntitlementActive: vi.fn(),
}));

vi.mock("../../services/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const mockFetch = vi.mocked(fetchEntitlementActive);
const mockInvoke = vi.mocked(supabase.functions.invoke);

function setUser(plan: User["plan"] | null) {
  useAuthStore.setState({
    user: plan ? ({ id: "u1", plan } as User) : null,
  });
}

describe("reconcileSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser("membership");
  });

  it("로그인 안 됨: 아무것도 하지 않는다", async () => {
    setUser(null);
    await reconcileSubscription();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("free 플랜: 대상 아님 — 조회조차 하지 않는다", async () => {
    setUser("free");
    await reconcileSubscription();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("developer 플랜: 절대 건드리지 않는다", async () => {
    setUser("developer");
    await reconcileSubscription();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("멤버십 + 활성 구독 있음(true): 다운그레이드하지 않는다", async () => {
    mockFetch.mockResolvedValue(true);
    await reconcileSubscription();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.plan).toBe("membership");
  });

  it("멤버십 + 판단 불가(null): 다운그레이드하지 않는다", async () => {
    mockFetch.mockResolvedValue(null);
    await reconcileSubscription();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.plan).toBe("membership");
  });

  it("멤버십 + 활성 구독 없음(false): free로 다운그레이드하고 스토어에 반영한다", async () => {
    mockFetch.mockResolvedValue(false);
    mockInvoke.mockResolvedValue({ data: { plan: "free" }, error: null } as never);
    await reconcileSubscription();
    expect(mockInvoke).toHaveBeenCalledWith("reconcile-subscription", {
      body: { entitled: false },
    });
    expect(useAuthStore.getState().user?.plan).toBe("free");
  });

  it("서버 에러: 스토어 plan을 바꾸지 않는다", async () => {
    mockFetch.mockResolvedValue(false);
    mockInvoke.mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await reconcileSubscription();
    expect(useAuthStore.getState().user?.plan).toBe("membership");
  });
});
