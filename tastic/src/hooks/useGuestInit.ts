import { useEffect } from "react";
import {
  getGuestInterviewUsed,
  getGuestPendingReview,
  getOrCreateGuestId,
} from "../utils/guestStorage";
import { useGuestStore } from "../stores/guestStore";

// 앱 부팅 시 게스트 기기 ID와 체험 사용 여부를 로컬에서 읽어 guestStore 에 반영한다.
// isGuest 자체는 여기서 켜지 않는다 — 게스트 진입은 온보딩의 '먼저 둘러보기'로만 일어난다.
export function useGuestInit() {
  const setGuestId = useGuestStore((s) => s.setGuestId);
  const setInterviewUsed = useGuestStore((s) => s.setInterviewUsed);
  const setHasPendingReview = useGuestStore((s) => s.setHasPendingReview);

  useEffect(() => {
    // 실패해도 앱을 막지 않는다 — guestId 가 없으면 게스트 LLM 호출만 서버에서 거절된다.
    getOrCreateGuestId().then(setGuestId).catch(() => {});
    getGuestInterviewUsed().then(setInterviewUsed).catch(() => {});
    // 앱을 껐다 켜도 보관분이 남아있을 수 있어 부팅 시 확인한다 —
    // 로그인 화면의 "로그인하면 저장되지 않는다" 안내가 이 값에 걸려 있다.
    getGuestPendingReview()
      .then((r) => setHasPendingReview(!!r))
      .catch(() => {});
  }, [setGuestId, setInterviewUsed, setHasPendingReview]);
}
