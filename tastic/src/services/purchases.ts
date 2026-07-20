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
    // 이미 익명이면 logOut이 에러를 던진다(비로그인 상태로 앱 시작 시) — 호출 자체를 건너뛴다
    if (await Purchases.isAnonymous()) return;
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

// 커스텀 페이월용 — 패키지 구매.
// 스토어 결제가 끝났는데 응답 CustomerInfo에 엔타이틀먼트가 없는 케이스가 실존한다
// (다른 앱 계정에 영수증이 귀속된 두 번째 기기 재구매 등 — 앱스토어 심사 리젝 사례).
// 이때 실패로 단정해 에러를 띄우면 "결제 완료했는데 에러"가 되므로,
// 최신 CustomerInfo 재확인 → 복원 시도 후에도 안 보이면 "pending"으로 구분해 돌려준다.
export async function purchaseMembership(
  pkg: PurchasesPackage
): Promise<PaywallOutcome> {
  if (!configured) return "unavailable";
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (hasMembership(customerInfo)) return "purchased";
    return (await recheckMembership()) ? "purchased" : "pending";
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return "cancelled";
    const code = String((e as { code?: string | number })?.code ?? "");
    // 이 스토어 계정에 이미 활성 구독이 있는 경우(재구매/두 번째 기기) —
    // 결제 실패가 아니라 복원으로 처리해야 한다.
    if (
      code === Purchases.PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR ||
      code === Purchases.PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR
    ) {
      return (await restoreMembership()) ? "purchased" : "pending";
    }
    console.error("[purchases] 구매 실패:", e);
    return "unavailable";
  }
}

// 구매 응답에 엔타이틀먼트가 없을 때의 재확인 — 서버 반영 지연이면 여기서 잡힌다.
async function recheckMembership(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    if (hasMembership(info)) return true;
    // 영수증 재동기화(복원)까지 시도 — 같은 스토어 계정의 활성 구독을 끌어온다
    return await restoreMembership();
  } catch (e) {
    console.error("[purchases] 멤버십 재확인 실패:", e);
    return false;
  }
}

// 스토어(RevenueCat)의 실제 멤버십 구독 상태를 조회한다.
// RevenueCat이 스토어 영수증을 검증해 만료까지 반영한 authoritative 값이다.
//   true  = 활성 구독 있음
//   false = 활성 구독 없음(만료/미구매)이 "확정"됨
//   null  = 판단 불가(SDK 미설정·네트워크 에러 등) → 호출부는 아무 판단도 하지 말 것
// 캐시가 있으면 오프라인에서도 마지막 상태를 돌려주므로 일시적 네트워크 실패로
// false 를 잘못 반환하지 않는다(에러 시에만 null).
export async function fetchEntitlementActive(): Promise<boolean | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasMembership(info);
  } catch (e) {
    console.error("[purchases] getCustomerInfo 실패:", e);
    return null;
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
// purchased: 구매/복원 성공(엔타이틀먼트 확인) → 프로필 재조회
// cancelled: 유저가 구매를 취소 → 아무것도 안 함
// pending: 스토어 결제는 완료됐으나 이 계정에서 멤버십 확인 불가 → 실패 아님,
//          서버(웹훅) 반영을 확인하고 그래도 없으면 안내 (에러 알림 금지)
// unavailable: 결제 비활성(키 미설정)·에러 → 실패 알림 (버튼 무반응 방지)
export type PaywallOutcome = "purchased" | "cancelled" | "pending" | "unavailable";

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
