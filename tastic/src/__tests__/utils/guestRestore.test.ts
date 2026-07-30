// 앱 재실행 시 게스트 모드 복귀 판단 테스트.
//
// 배경: 게스트는 메모리 상태(guestStore.isGuest)라 앱 종료 시 사라지는데, 인트로는
// 기기당 1회라 '먼저 둘러보기' 버튼이 있는 화면에 다시 닿을 수 없다. 그래서 체험을
// 시작만 하고 앱을 껐던 사용자가 로그인 화면에 갇히는 문제를 복귀 로직으로 푼다.
import { describe, it, expect } from "vitest";
import { shouldRestoreGuest } from "../../utils/guestRestore";

describe("shouldRestoreGuest", () => {
  it("체험을 시작하고 평론 생성 전에 앱을 껐다 켜면 게스트로 복귀한다", () => {
    expect(
      shouldRestoreGuest({ hasSession: false, sessionStarted: true, interviewUsed: false })
    ).toBe(true);
  });

  it("평론 생성을 마친 뒤에는 복귀하지 않는다 — 다음 단계는 재체험이 아니라 가입이다", () => {
    expect(
      shouldRestoreGuest({ hasSession: false, sessionStarted: true, interviewUsed: true })
    ).toBe(false);
  });

  it("로그인·회원가입으로 세션이 생긴 뒤에는 복귀하지 않는다", () => {
    expect(
      shouldRestoreGuest({ hasSession: true, sessionStarted: true, interviewUsed: false })
    ).toBe(false);
  });

  it("세션이 있으면 체험을 소진하지 않았어도 인증 경로가 우선한다", () => {
    expect(
      shouldRestoreGuest({ hasSession: true, sessionStarted: true, interviewUsed: true })
    ).toBe(false);
  });

  it("인트로에서 게스트를 시작한 적이 없으면 복귀하지 않는다 — 로그인 화면에 상시 진입로를 만들지 않는다", () => {
    expect(
      shouldRestoreGuest({ hasSession: false, sessionStarted: false, interviewUsed: false })
    ).toBe(false);
  });

  it("체험 기록만 있고 시작 기록이 없으면(구버전 설치분) 복귀하지 않는다", () => {
    expect(
      shouldRestoreGuest({ hasSession: false, sessionStarted: false, interviewUsed: true })
    ).toBe(false);
  });
});
