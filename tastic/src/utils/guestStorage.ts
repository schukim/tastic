import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { ContentCategory, ConversationEntry } from "../types/database";

// ── 게스트(비로그인 체험) 로컬 상태 ──
// Supabase 익명 인증을 쓰지 않는다. 게스트는 순전히 기기 로컬 상태이고,
// 서버에는 x-guest-id(기기 UUID)만 사용량 상한 용도로 전달된다.
// 로그인에 성공하면 보관해 둔 평론을 계정으로 이전하고 게스트 흔적을 지운다.

const GUEST_ID_KEY = "tastic_guest_id";
const GUEST_INTERVIEW_USED_KEY = "tastic_guest_interview_used";
const GUEST_PENDING_REVIEW_KEY = "tastic_guest_pending_review";
const GUEST_SESSION_KEY = "tastic_guest_session";

/** 게스트가 체험 중 확정한 작품 — 아직 works 행이 없으므로 원본 메타데이터를 그대로 보관한다. */
export interface GuestWork {
  title: string;
  originalTitle?: string | null;
  category: ContentCategory;
  creator?: string | null;
  year?: number | null;
  genre?: string | null;
  metadata?: Record<string, unknown>;
  // true = verify-content 로 식별된 후보(로그인 후 save-verified-work 로 승격)
  // false = 사용자가 직접 입력(전역 캐시를 오염시키지 않도록 일반 insert)
  verified: boolean;
}

export interface GuestPendingReview {
  work: GuestWork;
  conversation: ConversationEntry[];
  title: string | null;
  body: string;
  savedAt: string;
  // 계정 이전(guestMigration)의 진행 상태. 이전은 works → reviews → 사용량 기록의
  // 3단계인데 중간에 실패하면 로컬 보관분을 남겨 다음 로그인에 재시도한다. 그때 이미
  // 만든 행을 다시 만들지 않도록 각 단계의 결과 id 를 여기 적어둔다.
  //
  // migratedUserId: 그 id 들이 어느 계정에서 만들어졌는지. 계정이 다르면 재사용하지
  // 않는다 — 수동 입력 작품(is_verified=false)은 소유자만 읽을 수 있어(works RLS),
  // 남의 work 행을 참조하는 평론은 히스토리에서 깨진 항목이 된다.
  migratedUserId?: string;
  migratedWorkId?: string;
  migratedReviewId?: string;
  // 사용량 기록(claim-guest-review)만 계속 실패할 때 무한 재시도를 막는 카운터
  claimAttempts?: number;
}

// ── 게스트 기기 ID ──
// 서버(Edge Function)의 게스트 사용량 상한 키. 기기 로컬 값이라 재설치하면 새로 생긴다 —
// 서버는 이 값을 신뢰하지 않고 전역 일일 상한을 함께 건다(_shared/guest.ts 참조).

export async function getOrCreateGuestId(): Promise<string> {
  const existing = await AsyncStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(GUEST_ID_KEY, id);
  return id;
}

// ── 진행 중인 게스트 세션 ──
// 게스트로 앱을 쓰던 중 앱이 종료되면 메모리 상태(isGuest)가 날아가는데, 인트로는 이미
// 본 것으로 기록돼 있어 다시 '먼저 둘러보기'를 누를 방법이 없다. 그래서 인트로에서
// 게스트를 시작한 사실을 기기에 남겨두고, 체험이 끝나기 전(평론 생성 전) 재실행이면
// 게스트 모드로 되돌린다. 판단 로직은 utils/guestRestore.ts 참조.

export async function markGuestSessionStarted(): Promise<void> {
  await AsyncStorage.setItem(GUEST_SESSION_KEY, "true");
}

export async function getGuestSessionStarted(): Promise<boolean> {
  return (await AsyncStorage.getItem(GUEST_SESSION_KEY)) === "true";
}

export async function clearGuestSession(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_SESSION_KEY);
}

// ── 체험 1회 제한 ──

export async function getGuestInterviewUsed(): Promise<boolean> {
  return (await AsyncStorage.getItem(GUEST_INTERVIEW_USED_KEY)) === "true";
}

export async function markGuestInterviewUsed(): Promise<void> {
  await AsyncStorage.setItem(GUEST_INTERVIEW_USED_KEY, "true");
}

// ── 보관 중인 평론 ──

export async function saveGuestPendingReview(review: GuestPendingReview): Promise<void> {
  await AsyncStorage.setItem(GUEST_PENDING_REVIEW_KEY, JSON.stringify(review));
}

export async function getGuestPendingReview(): Promise<GuestPendingReview | null> {
  const raw = await AsyncStorage.getItem(GUEST_PENDING_REVIEW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestPendingReview;
  } catch {
    // 손상된 값은 조용히 버린다 — 파싱 실패가 로그인 플로우를 막으면 안 된다
    await AsyncStorage.removeItem(GUEST_PENDING_REVIEW_KEY);
    return null;
  }
}

export async function clearGuestPendingReview(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_PENDING_REVIEW_KEY);
}

/**
 * 이전이 끝난 뒤 게스트 흔적을 정리한다. 기기 ID(GUEST_ID_KEY)는 남겨둔다 —
 * 로그아웃 후 다시 둘러보기로 들어와도 서버 상한이 새 기기처럼 초기화되지 않게 하기 위함.
 *
 * 진행 중 세션 표시(GUEST_SESSION_KEY)도 함께 지운다 — 로그인/회원가입을 마친 뒤에는
 * 앱을 재실행해도 게스트로 돌아가지 않아야 한다.
 */
export async function clearGuestTrial(): Promise<void> {
  await AsyncStorage.multiRemove([
    GUEST_PENDING_REVIEW_KEY,
    GUEST_INTERVIEW_USED_KEY,
    GUEST_SESSION_KEY,
  ]);
}
