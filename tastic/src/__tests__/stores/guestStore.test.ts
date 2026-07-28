// 게스트 상태 전이 테스트.
// 계정 보유자 차단은 기기 기록으로 강제하지 않고 진입 직전 확인(IntroTourScreen)으로만
// 거른다 — 재설치하면 어떤 기기 기록도 사라져 실효가 없기 때문.
import { describe, it, expect, beforeEach } from "vitest";
import { useGuestStore } from "../../stores/guestStore";

const initial = useGuestStore.getState();

beforeEach(() => {
  useGuestStore.setState({
    isGuest: false,
    guestId: null,
    interviewUsed: false,
    cameFromGuest: false,
    authTarget: "login",
    hasPendingReview: false,
    pendingWork: null,
  });
});

describe("enterGuest", () => {
  it("게스트로 진입하면 isGuest 가 켜진다", () => {
    initial.enterGuest();
    expect(useGuestStore.getState().isGuest).toBe(true);
  });
});

describe("exitGuestToAuth", () => {
  it("회원가입 대상으로 나가면 authTarget 이 signUp — 인증 스택이 가입 화면부터 뜬다", () => {
    useGuestStore.setState({ isGuest: true });
    initial.exitGuestToAuth("signUp");
    const s = useGuestStore.getState();
    expect(s.isGuest).toBe(false);
    expect(s.authTarget).toBe("signUp");
    expect(s.cameFromGuest).toBe(true);
  });

  it("계정 기반 탭 안내는 로그인 화면으로 보낸다", () => {
    useGuestStore.setState({ isGuest: true });
    initial.exitGuestToAuth("login");
    expect(useGuestStore.getState().authTarget).toBe("login");
  });
});

describe("clearGuest", () => {
  it("로그인 완료 시 게스트 흔적을 모두 지운다", () => {
    useGuestStore.setState({
      isGuest: true,
      interviewUsed: true,
      hasPendingReview: true,
      cameFromGuest: true,
      pendingWork: { title: "x", category: "movie", verified: true },
    });

    initial.clearGuest();

    const s = useGuestStore.getState();
    expect(s.isGuest).toBe(false);
    expect(s.interviewUsed).toBe(false);
    expect(s.hasPendingReview).toBe(false);
    expect(s.cameFromGuest).toBe(false);
    expect(s.pendingWork).toBeNull();
  });
});
