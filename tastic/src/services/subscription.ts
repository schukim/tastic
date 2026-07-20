import { supabase } from "./supabase";
import { useAuthStore } from "../stores/authStore";
import { fetchEntitlementActive } from "./purchases";
import type { UserPlan } from "../types/database";

// 스토어(RevenueCat)의 실제 구독 상태와 DB users.plan 을 정합화한다.
//
// 왜 필요한가:
//   plan 은 오직 RevenueCat 웹훅으로만 바뀐다. iOS 는 App Store Server
//   Notifications 연동이 없으면 만료(EXPIRATION) 웹훅이 오지 않아, 구독이
//   만료돼도 plan 이 영영 'membership' 으로 남는다(앱스토어 심사 2.1 리젝 사유).
//   앱이 시작·마이탭 진입 시 스토어 상태를 직접 확인해 스스로 만료를 반영한다.
//
// 안전 원칙 — '다운그레이드'(membership → free)만 수행한다:
//   - RevenueCat 이 "활성 구독 없음(false)"을 확정한 경우에만 free 로 내린다.
//   - 업그레이드(free → membership)는 절대 클라이언트 주장으로 하지 않는다.
//     그건 웹훅/구매 폴링(검증된 소스)의 몫이다. 자기 계정을 free 로 내리는 건
//     악용 유인이 없어, 클라이언트가 트리거해도 안전하다.
//   - developer(내부용)는 대상에서 제외한다.
export async function reconcileSubscription(): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;
  // membership 만 대상 — free 는 내릴 게 없고, developer 는 건드리지 않는다.
  if (user.plan !== "membership") return;

  const entitled = await fetchEntitlementActive();
  // null(판단 불가) / true(활성) 일 때는 아무것도 하지 않는다.
  // false(활성 구독 없음이 확정)일 때만 다운그레이드한다.
  if (entitled !== false) return;

  try {
    const { data, error } = await supabase.functions.invoke("reconcile-subscription", {
      body: { entitled: false },
    });
    if (error) {
      console.error("[subscription] 정합화 실패:", error);
      return;
    }
    const nextPlan = (data as { plan?: UserPlan | null } | null)?.plan;
    const current = useAuthStore.getState().user;
    if (nextPlan && current && nextPlan !== current.plan) {
      useAuthStore.getState().setUser({ ...current, plan: nextPlan });
    }
  } catch (e) {
    console.error("[subscription] 정합화 예외:", e);
  }
}
