import { useEffect } from "react";
import { Linking } from "react-native";
import { exchangeAuthCode, getAuthCodeFromUrl } from "../services/auth";

/**
 * 앱으로 들어오는 딥링크(이메일 확인 링크 등)에서 PKCE 인증 코드를 추출해
 * 세션으로 교환한다. 이메일 확인 후 같은 기기에서 링크를 누르면 AsyncStorage 에
 * 저장된 code_verifier 로 교환이 성공해 자동 로그인된다.
 *
 * OAuth 콜백(안드로이드 Custom Tabs)이 여기로도 들어올 수 있는데, signInWithGoogle 의
 * WebBrowser 반환 경로와 같은 code 를 동시에 교환하면 verifier 가 한 번만 존재해 한쪽이
 * "PKCE code verifier not found in storage" 로 실패한다. exchangeAuthCode 로 code 단위
 * dedupe 하여 이미 교환된 code 는 조용히 건너뛴다.
 */
export function useDeepLinkAuth() {
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const code = getAuthCodeFromUrl(url);
      if (!code) return;
      try {
        await exchangeAuthCode(code);
      } catch (e) {
        console.error("deep link auth exchange error:", e);
      }
    };

    // 앱이 종료 상태에서 링크로 열린 경우
    Linking.getInitialURL().then(handleUrl);
    // 앱이 실행 중일 때 링크 수신
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);
}
