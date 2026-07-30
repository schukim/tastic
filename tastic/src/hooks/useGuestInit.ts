import { useEffect } from "react";
import {
  getGuestInterviewUsed,
  getGuestPendingReview,
  getGuestSessionStarted,
  getOrCreateGuestId,
} from "../utils/guestStorage";
import { shouldRestoreGuest } from "../utils/guestRestore";
import { useGuestStore } from "../stores/guestStore";
import { useAuthStore } from "../stores/authStore";

// 앱 부팅 시 게스트 기기 상태를 로컬에서 읽어 guestStore 에 반영하고, 중단된 게스트 체험이
// 있으면 게스트 모드로 되돌린다.
//
// 복귀는 세션 판별이 끝난 뒤에만 결정한다 — 로그인 사용자에게 isGuest 를 켜면 LLM 호출에
// x-guest-id 헤더가 새어나가(services/claude.ts) 서버가 플랜 한도 대신 게스트 한도를
// 태울 수 있다. 서버도 이중 방어하지만 클라이언트가 먼저 정직해야 한다.
export function useGuestInit() {
  const setGuestId = useGuestStore((s) => s.setGuestId);
  const setInterviewUsed = useGuestStore((s) => s.setInterviewUsed);
  const setHasPendingReview = useGuestStore((s) => s.setHasPendingReview);
  const setBootstrapped = useGuestStore((s) => s.setBootstrapped);
  const resumeGuest = useGuestStore((s) => s.resumeGuest);

  const authLoading = useAuthStore((s) => s.isLoading);
  const hasSession = useAuthStore((s) => !!s.session);

  useEffect(() => {
    // 실패해도 앱을 막지 않는다 — guestId 가 없으면 게스트 LLM 호출만 서버에서 거절된다.
    getOrCreateGuestId().then(setGuestId).catch(() => {});
    // 앱을 껐다 켜도 보관분이 남아있을 수 있어 부팅 시 확인한다 —
    // 로그인 화면의 "로그인하면 저장되지 않는다" 안내가 이 값에 걸려 있다.
    getGuestPendingReview()
      .then((r) => setHasPendingReview(!!r))
      .catch(() => {});
  }, [setGuestId, setHasPendingReview]);

  useEffect(() => {
    // 세션 유무가 확정되기 전에는 복귀를 결정하지 않는다.
    if (authLoading) return;

    let cancelled = false;

    (async () => {
      try {
        const [sessionStarted, interviewUsed] = await Promise.all([
          getGuestSessionStarted(),
          getGuestInterviewUsed(),
        ]);
        if (cancelled) return;

        setInterviewUsed(interviewUsed);
        if (shouldRestoreGuest({ hasSession, sessionStarted, interviewUsed })) {
          resumeGuest();
        }
      } catch {
        // 스토리지 읽기 실패는 "복귀 안 함"으로 처리한다 — 로그인 화면이 기본값이다.
      } finally {
        // 성공/실패와 무관하게 반드시 풀어준다. 여기서 막히면 로딩 화면에 갇힌다.
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, hasSession, setInterviewUsed, setBootstrapped, resumeGuest]);
}
