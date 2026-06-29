import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/authStore";
import { loadProfile } from "../services/profile";
import { identifyPurchasesUser, logOutPurchasesUser } from "../services/purchases";
import * as Sentry from "@sentry/react-native";

export function useAuth() {
  const { setSession, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Explicitly fetch the initial session — onAuthStateChange alone can miss
    // INITIAL_SESSION if the listener attaches after Supabase reads AsyncStorage.
    // try/finally 로 감싸 getSession 이 실패/지연돼도 isLoading 이 반드시 풀리게 한다.
    // (이게 없으면 깨진 인증 상태가 앱을 로딩 화면에 영구히 가둔다.)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await loadProfile(session.user.id);
          setSession(session);
          // RevenueCat appUserID를 Supabase user.id로 맞춘다 (웹훅 매핑용)
          void identifyPurchasesUser(session.user.id);
          // 크래시 추적용 user id (PII 최소화 — id만)
          Sentry.setUser({ id: session.user.id });
        } else {
          setUser(null);
          setSession(null);
        }
      } catch (e) {
        console.error("getSession failed:", e);
        setUser(null);
        setSession(null);
      } finally {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // onAuthStateChange 콜백 안에서 다른 supabase 호출(fetchProfile)을 직접 await 하면
        // auth 내부 lock 이 잡힌 채라 데드락이 나서 상태 반영이 지연된다
        // (로그인 직후 화면이 안 넘어가고 새로고침해야 넘어가는 증상). setTimeout(0) 으로
        // 락 밖으로 빼서 처리한다 — Supabase 공식 권장 패턴.
        setTimeout(async () => {
          if (session?.user) {
            await loadProfile(session.user.id);
            setSession(session);
            void identifyPurchasesUser(session.user.id);
            Sentry.setUser({ id: session.user.id });
          } else {
            setUser(null);
            setSession(null);
            void logOutPurchasesUser();
            Sentry.setUser(null);
          }
          setLoading(false);
        }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }, [setSession, setUser, setLoading]);
}
