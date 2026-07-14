import { Linking, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

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

// 결제 SDK가 초기화됐는지(플랫폼 키가 있는지). 커스텀 페이월이 UI를 그릴지 판단.
export function isPurchasesConfigured(): boolean {
  return configured;
}

// 커스텀 페이월용 — 현재 Offering에서 월간(멤버십) 패키지를 가져온다.
// 우선순위: 표준 monthly 슬롯 → 없으면 available 패키지 중 첫 번째.
// 키 미설정/오퍼링 없음/네트워크 실패 시 null.
export async function getMembershipPackage(): Promise<PurchasesPackage | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    return current.monthly ?? current.availablePackages[0] ?? null;
  } catch (e) {
    console.error("[purchases] getOfferings 실패:", e);
    return null;
  }
}

// 커스텀 페이월용 — 패키지 구매. 페이월과 동일한 3분류 결과를 돌려준다.
// purchased: 구매 성공(멤버십 엔타이틀먼트 활성) / cancelled: 유저 취소 / unavailable: 실패
export async function purchaseMembership(
  pkg: PurchasesPackage
): Promise<PaywallOutcome> {
  if (!configured) return "unavailable";
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasMembership(customerInfo) ? "purchased" : "unavailable";
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return "cancelled";
    console.error("[purchases] 구매 실패:", e);
    return "unavailable";
  }
}

// 커스텀 페이월용 — 구매 복원. 활성 멤버십이 있으면 true.
export async function restoreMembership(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    return hasMembership(info);
  } catch (e) {
    console.error("[purchases] 복원 실패:", e);
    return false;
  }
}

// 결제 결과 구분 — 호출부가 "유저 취소(조용히)"와 "실패(알림 필요)"를 다르게 처리한다.
// purchased: 구매/복원 성공 → 프로필 재조회
// cancelled: 유저가 구매를 취소 → 아무것도 안 함
// unavailable: 결제 비활성(키 미설정)·에러 → 실패 알림 (버튼 무반응 방지)
export type PaywallOutcome = "purchased" | "cancelled" | "unavailable";

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
