import { useEffect } from "react";
import { Linking } from "react-native";
import { supabase } from "../services/supabase";
import { getAuthCodeFromUrl } from "../services/auth";

/**
 * 앱으로 들어오는 딥링크(이메일 확인 링크 등)에서 PKCE 인증 코드를 추출해
 * 세션으로 교환한다. 이메일 확인 후 같은 기기에서 링크를 누르면 AsyncStorage 에
 * 저장된 code_verifier 로 교환이 성공해 자동 로그인된다.
 *
 * OAuth 콜백은 WebBrowser.openAuthSessionAsync 가 직접 처리하므로 보통 여기로는
 * 오지 않지만, 들어오더라도 code 가 이미 소비돼 조용히 무시된다.
 */
export function useDeepLinkAuth() {
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const code = getAuthCodeFromUrl(url);
      if (!code) return;
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
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
