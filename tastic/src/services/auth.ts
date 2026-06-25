import { Platform } from "react-native";
import { supabase } from "./supabase";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";

WebBrowser.maybeCompleteAuthSession();

// PKCE OAuth/이메일 확인 콜백 URL(예: tastic://auth/callback?code=...)에서 인증 코드를 추출한다.
// exchangeCodeForSession 은 전체 URL 이 아니라 code 문자열만 받는다.
export function getAuthCodeFromUrl(url: string): string | null {
  const match = url.match(/[?&]code=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface SignUpParams {
  email: string;
  password: string;
  nickname: string;
}

// 가입 시점에는 인증 + 닉네임만 받는다. 관심 카테고리 등 프로필은 가입 방식
// (이메일/구글/애플)과 무관하게 온보딩 화면에서 일괄 입력한다.
export async function signUp({ email, password, nickname }: SignUpParams) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // 이메일 확인 링크를 앱으로 되돌려 useDeepLinkAuth 가 세션을 교환하게 한다.
      emailRedirectTo: makeRedirectUri({ path: "auth/callback" }),
      data: { nickname },
    },
  });

  if (error) throw error;

  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resendConfirmation(email: string) {
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({
    path: "auth/callback",
  });
  console.log("[google] redirectTo =", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) throw error;
  console.log("[google] oauth url =", data?.url);

  // Open the OAuth provider's authentication URL
  if (data.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );
    console.log("[google] browser result.type =", result.type);
    console.log("[google] browser result.url =", "url" in result ? result.url : "(none)");

    if (result.type === "success") {
      const code = getAuthCodeFromUrl(result.url);
      console.log("[google] extracted code =", code);
      if (!code) throw new Error("인증 코드를 받지 못했습니다");
      const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
      if (sessionError) throw sessionError;
      return sessionData;
    }
  }

  return data;
}

export async function signInWithApple() {
  // iOS: 네이티브 Sign in with Apple 시트(ASAuthorizationController)를 사용한다.
  // App Store 심사 가이드라인은 iOS에서 웹 리다이렉트 방식을 허용하지 않으므로
  // identityToken 을 받아 supabase.auth.signInWithIdToken 으로 교환한다.
  if (Platform.OS === "ios") {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple 인증 토큰을 받지 못했습니다");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
      if (sessionError) throw sessionError;
      return sessionData;
    } catch (e) {
      // 사용자가 시트를 닫은 경우는 오류로 취급하지 않고 조용히 종료한다.
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code?: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        return null;
      }
      throw e;
    }
  }

  // Android/웹: 네이티브 Apple SDK 가 없으므로 OAuth 웹 리다이렉트 플로우를 쓴다.
  const redirectTo = makeRedirectUri({
    path: "auth/callback",
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo,
    },
  });

  if (error) throw error;

  // Open the OAuth provider's authentication URL
  if (data.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );

    if (result.type === "success") {
      const code = getAuthCodeFromUrl(result.url);
      if (!code) throw new Error("인증 코드를 받지 못했습니다");
      const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
      if (sessionError) throw sessionError;
      return sessionData;
    }
  }

  return data;
}
