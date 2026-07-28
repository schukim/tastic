import { create } from "zustand";
import type { GuestWork } from "../utils/guestStorage";

// 게스트(비로그인 체험) 전역 상태.
//
// 배경: App Store 5.1.1(v) — 계정 기반이 아닌 콘텐츠는 가입 없이 이용할 수 있어야 한다.
// 그래서 온보딩에서 '먼저 둘러보기'로 진입하면 세션 없이도 Main 으로 들어가
// 인터뷰 1회 → 평론 생성까지 체험할 수 있다. 회원가입은 "저장"에만 요구된다.
//
// Supabase 익명 인증은 쓰지 않는다 — 세션 병합 로직 없이 로컬 상태로만 관리한다.
interface GuestState {
  // 지금 게스트로 앱을 쓰고 있는가 (세션 없이 Main 진입)
  isGuest: boolean;
  // 서버 게스트 사용량 상한 키 (기기 로컬 UUID). 부팅 시 주입.
  guestId: string | null;
  // 체험 인터뷰를 이미 1회 썼는가 (AsyncStorage 미러)
  interviewUsed: boolean;
  // 게스트가 로그인하러 나갔는가 — 로그인 화면에서 '둘러보기로 돌아가기'를 노출할지 판단
  cameFromGuest: boolean;
  // 게스트를 인증 스택으로 내보낼 때 어느 화면부터 보여줄지.
  // 저장/체험소진 유도는 회원가입("체험 평론은 새 계정으로 옮겨진다"), 계정 기반 탭 안내는 로그인.
  authTarget: "login" | "signUp";
  // 보관 중인 체험 평론이 있는가 — 로그인 화면에서 "로그인하면 저장되지 않는다" 안내 노출용
  hasPendingReview: boolean;
  // 체험 중 확정한 작품의 원본 메타데이터. works 행을 만들지 않으므로(guestWork.ts 참조)
  // 로그인 후 이전 시점에 실제 작품을 만들려면 이 원본이 필요하다.
  pendingWork: GuestWork | null;

  enterGuest: () => void;
  exitGuestToAuth: (target: "login" | "signUp") => void;
  resumeGuest: () => void;
  setGuestId: (id: string) => void;
  setInterviewUsed: (used: boolean) => void;
  setPendingWork: (work: GuestWork | null) => void;
  setHasPendingReview: (has: boolean) => void;
  // 로그인 완료 후 게스트 상태 종료
  clearGuest: () => void;
}

export const useGuestStore = create<GuestState>((set) => ({
  isGuest: false,
  guestId: null,
  interviewUsed: false,
  cameFromGuest: false,
  authTarget: "login",
  hasPendingReview: false,
  pendingWork: null,

  enterGuest: () => set({ isGuest: true, cameFromGuest: false }),
  // isGuest 를 내리면 RootNavigator 가 Auth 스택으로 전환된다.
  // 보관 중인 평론은 AsyncStorage 에 있으므로 이 전환으로 유실되지 않는다.
  exitGuestToAuth: (authTarget) => set({ isGuest: false, cameFromGuest: true, authTarget }),
  resumeGuest: () => set({ isGuest: true, cameFromGuest: false }),
  setGuestId: (guestId) => set({ guestId }),
  setInterviewUsed: (interviewUsed) => set({ interviewUsed }),
  setPendingWork: (pendingWork) => set({ pendingWork }),
  setHasPendingReview: (hasPendingReview) => set({ hasPendingReview }),
  clearGuest: () =>
    set({
      isGuest: false,
      cameFromGuest: false,
      interviewUsed: false,
      pendingWork: null,
      hasPendingReview: false,
    }),
}));
