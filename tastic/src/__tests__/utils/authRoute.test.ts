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
      resolveAuthRoute({
        isLoading: true,
        hasSession: true,
        profileStatus: "loaded",
        user: userWith(["movie"]),
      })
    ).toBe("Loading");
  });

  it("세션이 없으면 Auth(로그인/가입)", () => {
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: false, profileStatus: "loading", user: null })
    ).toBe("Auth");
  });

  it("애플/구글 첫 가입: 세션은 있고 프로필 카테고리가 비어있으면 Onboarding", () => {
    // 트리거가 만든 직후의 상태(닉네임 'User', 카테고리 빈 배열)
    expect(
      resolveAuthRoute({
        isLoading: false,
        hasSession: true,
        profileStatus: "loaded",
        user: userWith([]),
      })
    ).toBe("Onboarding");
  });

  it("온보딩 완료(카테고리 채워짐)면 Main", () => {
    expect(
      resolveAuthRoute({
        isLoading: false,
        hasSession: true,
        profileStatus: "loaded",
        user: userWith(["movie", "book"]),
      })
    ).toBe("Main");
  });

  it("세션은 있으나 프로필을 아직 불러오는 중(loading)이면 Loading", () => {
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: true, profileStatus: "loading", user: null })
    ).toBe("Loading");
  });

  it("세션은 있으나 프로필 조회 실패(error)면 Main 이 아니라 ProfileError", () => {
    // user=null 인 채 Main 으로 들어가 빈 화면이 되는 회귀를 방지한다.
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: true, profileStatus: "error", user: null })
    ).toBe("ProfileError");
  });

  it("방어: status=loaded 인데 user 가 null 이면 ProfileError", () => {
    expect(
      resolveAuthRoute({ isLoading: false, hasSession: true, profileStatus: "loaded", user: null })
    ).toBe("ProfileError");
  });

  // ── 게스트(비로그인 체험) ──
  // App Store 5.1.1(v): 가입 없이 인터뷰·평론 생성을 체험할 수 있어야 한다.

  it("게스트는 세션이 없어도 Main 으로 들어간다", () => {
    expect(
      resolveAuthRoute({
        isLoading: false,
        hasSession: false,
        profileStatus: "loading",
        user: null,
        isGuest: true,
      })
    ).toBe("Main");
  });

  it("게스트 플래그가 남아있어도 세션이 있으면 정상 인증 경로를 따른다", () => {
    // 로그인 직후 useAuth 가 isGuest 를 내리기 전 한 프레임을 방어한다.
    expect(
      resolveAuthRoute({
        isLoading: false,
        hasSession: true,
        profileStatus: "loaded",
        user: userWith([]),
        isGuest: true,
      })
    ).toBe("Onboarding");
  });

  it("게스트여도 부팅 로딩 중에는 Loading 이 우선한다", () => {
    expect(
      resolveAuthRoute({
        isLoading: true,
        hasSession: false,
        profileStatus: "loading",
        user: null,
        isGuest: true,
      })
    ).toBe("Loading");
  });
});
