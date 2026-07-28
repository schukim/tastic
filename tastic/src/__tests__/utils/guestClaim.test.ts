// 게스트 체험 평론의 계정 이전 조건 테스트.
// 핵심 규칙: 이전은 "갓 만들어진 계정"에만. 기존 계정으로 로그인하면 이전하지 않는다
// (남의/지난 체험물이 꽂히거나, 그 계정의 오늘 무료 1편이 모르게 소진되는 것 방지).
import { describe, it, expect } from "vitest";
import { shouldClaimGuestReview, NEW_ACCOUNT_WINDOW_MS } from "../../utils/guestClaim";

const NOW = new Date("2026-07-28T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("shouldClaimGuestReview", () => {
  it("방금 만든 계정이면 이전한다", () => {
    expect(shouldClaimGuestReview(ago(5_000), NOW)).toBe(true);
  });

  it("이메일 확인이 늦어져도 창(1시간) 안이면 이전한다", () => {
    expect(shouldClaimGuestReview(ago(50 * 60 * 1000), NOW)).toBe(true);
  });

  it("기존 계정(창을 넘긴 계정)으로 로그인하면 이전하지 않는다", () => {
    expect(shouldClaimGuestReview(ago(NEW_ACCOUNT_WINDOW_MS + 1000), NOW)).toBe(false);
  });

  it("한참 전에 만든 계정은 당연히 이전하지 않는다", () => {
    expect(shouldClaimGuestReview(ago(30 * 24 * 60 * 60 * 1000), NOW)).toBe(false);
  });

  it("기기·서버 시계 차로 created_at 이 살짝 미래여도 이전한다", () => {
    expect(shouldClaimGuestReview(ago(-60 * 1000), NOW)).toBe(true);
  });

  it("시계 차가 허용치를 크게 넘으면 이전하지 않는다", () => {
    expect(shouldClaimGuestReview(ago(-30 * 60 * 1000), NOW)).toBe(false);
  });

  it("created_at 이 없거나 이상하면 이전하지 않는다 (보수적으로 차단)", () => {
    expect(shouldClaimGuestReview(undefined, NOW)).toBe(false);
    expect(shouldClaimGuestReview(null, NOW)).toBe(false);
    expect(shouldClaimGuestReview("", NOW)).toBe(false);
    expect(shouldClaimGuestReview("not-a-date", NOW)).toBe(false);
  });
});
