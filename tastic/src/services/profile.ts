import { supabase } from "./supabase";
import { useAuthStore } from "../stores/authStore";
import i18n from "../i18n";
import type { User } from "../types/database";

// PostgREST 가 "0 rows" 일 때 .single() 에서 내는 코드.
// 소셜 첫 가입 직후엔 handle_new_user 트리거가 users row 를 만들기 전이라
// 잠깐 이 에러가 날 수 있다(트리거 지연). 이 경우에만 짧게 재시도한다.
const NO_ROW_CODE = "PGRST116";
const RETRY_DELAYS_MS = [300, 600, 1200];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * users 프로필 row 를 조회한다. 트리거 지연으로 인한 "row 없음" 만 자동 재시도하고,
 * 그 외 에러(네트워크/RLS 등)는 즉시 반환해 호출부가 재시도 UI 로 처리하게 한다.
 */
export async function fetchUserProfile(
  userId: string
): Promise<{ data: User | null; error: unknown }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error) return { data: data as User, error: null };

    lastError = error;
    // 트리거 지연(row 없음)이 아니면 재시도해도 의미 없으니 즉시 중단.
    if ((error as { code?: string })?.code !== NO_ROW_CODE) break;

    const wait = RETRY_DELAYS_MS[attempt];
    if (wait !== undefined) await delay(wait);
  }

  return { data: null, error: lastError };
}

/**
 * 프로필을 조회해 authStore 에 반영한다. 라우팅(resolveAuthRoute)이 읽는
 * profileStatus 를 함께 갱신한다.
 *
 * - 첫 로드(아직 user 없음)에서 실패하면 status="error" 로 두어 재시도 화면으로 보낸다.
 * - 이미 user 가 있는 상태의 백그라운드 새로고침(토큰 갱신 등)이 실패하면
 *   기존 프로필을 유지한다 — 일시적 실패로 멀쩡한 세션을 깨지 않기 위함.
 */
export async function loadProfile(userId: string): Promise<void> {
  const { user: existing, setUser, setProfileStatus } = useAuthStore.getState();

  // 첫 로드일 때만 로딩 상태로 — 이미 프로필이 있으면 깜빡임 없이 조용히 새로고침.
  if (!existing) setProfileStatus("loading");

  const { data, error } = await fetchUserProfile(userId);

  if (error || !data) {
    console.error("loadProfile failed:", error);
    // 한 번도 못 불러온 상태에서의 실패만 에러로 승격. 기존 프로필이 있으면 유지.
    if (!useAuthStore.getState().user) {
      setUser(null);
      setProfileStatus("error");
    }
    return;
  }

  setUser(data);
  setProfileStatus("loaded");

  // 저장된 언어 설정을 UI에 반영 — 이게 없으면 en 유저도 앱을 켤 때마다 ko로 시작한다.
  if (data.language && i18n.language !== data.language) {
    void i18n.changeLanguage(data.language);
  }
}
