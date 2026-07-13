import { Linking, Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

// 스토어 구독 관리 웹페이지. 네이티브 관리 시트를 열 수 없을 때의 폴백.
const SUBSCRIPTIONS_URL =
  Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";

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

// 페이월 결과 구분 — 호출부가 "유저 취소(조용히)"와 "실패(알림 필요)"를 다르게 처리한다.
// purchased: 구매/복원 성공 또는 이미 멤버십(NOT_PRESENTED) → 프로필 재조회
// cancelled: 유저가 페이월을 닫음 → 아무것도 안 함
// unavailable: 결제 비활성(키 미설정)·페이월 에러 → 실패 알림 (버튼 무반응 방지)
export type PaywallOutcome = "purchased" | "cancelled" | "unavailable";

// RevenueCat 페이월을 띄운다.
export async function presentMembershipPaywall(): Promise<PaywallOutcome> {
  if (!configured) {
    console.warn("[purchases] 미설정 상태 — 페이월 표시 불가");
    return "unavailable";
  }
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: MEMBERSHIP_ENTITLEMENT,
    });
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
      // 이미 엔타이틀먼트 보유 → 페이월 미표시. users.plan 이 뒤처졌을 수 있으니
      // 구매 성공과 동일하게 프로필 재조회를 태운다.
      case PAYWALL_RESULT.NOT_PRESENTED:
        return "purchased";
      case PAYWALL_RESULT.CANCELLED:
        return "cancelled";
      default: // ERROR 등
        return "unavailable";
    }
  } catch (e) {
    console.error("[purchases] 페이월 표시 실패:", e);
    return "unavailable";
  }
}

// 네이티브 구독 관리 화면(구글 플레이/앱스토어)을 연다.
// 구독 취소·플랜 변경은 스토어가 소유하므로 앱은 관리 화면으로 연결만 한다.
// 네이티브 시트를 못 열면(미설정·실 구독 없음·시뮬레이터 등) 스토어 구독 관리
// 웹페이지로 폴백해, 버튼이 무반응으로 끝나지 않게 한다.
// 반환값: 무언가 열렸으면 true, 폴백까지 모두 실패하면 false.
export async function manageSubscription(): Promise<boolean> {
  if (configured) {
    try {
      await Purchases.showManageSubscriptions();
      return true;
    } catch (e) {
      console.error("[purchases] 네이티브 구독 관리 실패 — 웹 폴백:", e);
    }
  } else {
    console.warn("[purchases] 미설정 상태 — 웹 구독 관리로 폴백");
  }
  try {
    await Linking.openURL(SUBSCRIPTIONS_URL);
    return true;
  } catch (e) {
    console.error("[purchases] 구독 관리 웹 폴백도 실패:", e);
    return false;
  }
}
