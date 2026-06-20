import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

// RevenueCat 연동.
// - 엔타이틀먼트 식별자 "membership"이 active면 멤버십으로 간주.
// - 플랜의 source of truth는 RevenueCat 웹훅 → users.plan (revenuecat-webhook Edge Function).
//   클라이언트는 구매 직후 프로필을 재조회해 빠르게 반영만 한다.
// - appUserID는 Supabase user.id로 맞춰 웹훅의 app_user_id와 일치시킨다.

// 멤버십을 부여하는 RevenueCat 엔타이틀먼트 식별자. 대시보드 설정과 일치해야 한다.
export const MEMBERSHIP_ENTITLEMENT = "membership";

const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

let configured = false;

function apiKey(): string {
  return Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
}

// 앱 시작 시 1회 호출. 키가 없으면(아직 미설정 플랫폼) 조용히 건너뛴다.
export function initPurchases(): void {
  if (configured) return;
  const key = apiKey();
  if (!key) {
    // iOS 키 미설정 등 — 결제 비활성 상태로 앱은 정상 동작
    console.warn(`[purchases] ${Platform.OS} RevenueCat key 미설정 — 결제 비활성`);
    return;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: key });
  configured = true;
}

// 로그인 시 호출 — RevenueCat appUserID를 Supabase user.id로 맞춘다.
export async function identifyPurchasesUser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.error("[purchases] logIn 실패:", e);
  }
}

// 로그아웃 시 호출 — 익명 사용자로 되돌린다.
export async function logOutPurchasesUser(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.error("[purchases] logOut 실패:", e);
  }
}

export function hasMembership(info: CustomerInfo): boolean {
  return info.entitlements.active[MEMBERSHIP_ENTITLEMENT] !== undefined;
}

// RevenueCat 페이월을 띄운다. 구매/복원 성공 시 true.
// 결제가 비활성(키 미설정)이거나 취소/에러면 false.
export async function presentMembershipPaywall(): Promise<boolean> {
  if (!configured) {
    console.warn("[purchases] 미설정 상태 — 페이월 표시 불가");
    return false;
  }
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: MEMBERSHIP_ENTITLEMENT,
    });
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) {
    console.error("[purchases] 페이월 표시 실패:", e);
    return false;
  }
}
