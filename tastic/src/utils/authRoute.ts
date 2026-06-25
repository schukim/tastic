import type { User } from "../types/database";

export type AuthRoute = "Loading" | "Auth" | "Onboarding" | "Main";

/**
 * 인증 상태로부터 최상위 라우트를 결정한다. RootNavigator 의 분기와 동일한 로직을
 * 순수 함수로 분리해 단위 테스트 가능하게 한다.
 *
 * 가입/로그인은 구분하지 않는다 — Supabase 가 신규 유저를 만들고, 앱은 프로필이
 * 비었는지(`preferred_categories` 가 비어있는지)로만 온보딩 필요 여부를 판단한다.
 * 이메일·구글·애플 어떤 방식으로 가입하든 동일한 회로를 탄다.
 */
export function resolveAuthRoute(params: {
  isLoading: boolean;
  hasSession: boolean;
  user: Pick<User, "preferred_categories"> | null;
}): AuthRoute {
  const { isLoading, hasSession, user } = params;

  if (isLoading) return "Loading";
  if (!hasSession) return "Auth";

  const needsOnboarding = !!user && (user.preferred_categories?.length ?? 0) === 0;
  if (needsOnboarding) return "Onboarding";

  return "Main";
}
