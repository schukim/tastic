// 멤버십 사용량 기간 경계(KST) 계산 테스트
import { describe, it, expect } from "vitest";
import { periodStart } from "../../utils/usagePeriod";

describe("periodStart", () => {
  it("day: KST 자정(UTC 15:00)을 반환한다", () => {
    // 2026-06-10 12:00 KST = 2026-06-10 03:00 UTC
    const now = new Date("2026-06-10T03:00:00Z");
    const start = periodStart("day", now);
    // KST 2026-06-10 00:00 = UTC 2026-06-09 15:00
    expect(start.toISOString()).toBe("2026-06-09T15:00:00.000Z");
  });

  it("day: KST 기준 자정 직전/직후를 다른 날로 구분한다", () => {
    // UTC 2026-06-09 14:59 = KST 2026-06-09 23:59 → 6/9의 시작
    const beforeMidnight = periodStart("day", new Date("2026-06-09T14:59:00Z"));
    expect(beforeMidnight.toISOString()).toBe("2026-06-08T15:00:00.000Z");

    // UTC 2026-06-09 15:01 = KST 2026-06-10 00:01 → 6/10의 시작
    const afterMidnight = periodStart("day", new Date("2026-06-09T15:01:00Z"));
    expect(afterMidnight.toISOString()).toBe("2026-06-09T15:00:00.000Z");
  });

  it("week: KST 기준 월요일 자정을 반환한다", () => {
    // 2026-06-10은 수요일(KST) → 주 시작은 6/8(월) 00:00 KST
    const now = new Date("2026-06-10T03:00:00Z");
    const start = periodStart("week", now);
    expect(start.toISOString()).toBe("2026-06-07T15:00:00.000Z");
  });

  it("week: 월요일 당일은 그날이 주 시작이다", () => {
    // 2026-06-08 09:00 KST (월) = UTC 06-08 00:00
    const monday = periodStart("week", new Date("2026-06-08T00:00:00Z"));
    expect(monday.toISOString()).toBe("2026-06-07T15:00:00.000Z");
  });

  it("week: 일요일은 직전 월요일로 거슬러 간다", () => {
    // 2026-06-14 12:00 KST (일) = UTC 06-14 03:00
    const sunday = periodStart("week", new Date("2026-06-14T03:00:00Z"));
    expect(sunday.toISOString()).toBe("2026-06-07T15:00:00.000Z");
  });
});
