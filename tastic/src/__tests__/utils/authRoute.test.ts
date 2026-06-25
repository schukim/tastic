// 인증 라우팅 분기 테스트 — 특히 소셜(구글/애플) 첫 가입 → 온보딩 흐름을 검증한다.
import { describe, it, expect } from "vitest";
import { resolveAuthRoute } from "../../utils/authRoute";
import type { User } from "../../types/database";

// 프로필 row 의 최소 형태. handle_new_user 트리거는 가입 직후 닉네임만 채우고
// preferred_categories 는 비워둔다(소셜 가입 시 빈 배열).
function userWith(categories: User["preferred_categories"]): Pick<User, "preferred_categories"> {
  return { preferred_categories: categories };
}

describe("resolveAuthRoute", () => {
  it("로딩 중이면 세션·유저와 무관하게 Loading", () => {
    expect(
      resolveAuthRoute({ isLoading: true, hasSession: true, user: userWith(["movie"]) })
    ).toBe("Loading");
  });

  it("세션이 없으면 Auth(로그인/가입)", () => {
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: false, user: null })
    ).toBe("Auth");
  });

  it("애플/구글 첫 가입: 세션은 있고 프로필 카테고리가 비어있으면 Onboarding", () => {
    // 트리거가 만든 직후의 상태(닉네임 'User', 카테고리 빈 배열)
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: true, user: userWith([]) })
    ).toBe("Onboarding");
  });

  it("온보딩 완료(카테고리 채워짐)면 Main", () => {
    expect(
      resolveAuthRoute({
        isLoading: false,
        hasSession: true,
        user: userWith(["movie", "book"]),
      })
    ).toBe("Main");
  });

  it("세션은 있으나 프로필 fetch 전(user=null)이면 아직 온보딩 아님 → Main 분기로 보내지 않고 Onboarding 도 아님", () => {
    // user 가 아직 null 이면 needsOnboarding=false 라 Main 으로 떨어진다.
    // (fetchProfile 완료 후 onAuthStateChange 가 다시 평가하므로 깜빡임은 짧다)
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: true, user: null })
    ).toBe("Main");
  });
});
