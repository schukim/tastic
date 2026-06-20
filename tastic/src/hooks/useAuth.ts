import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/authStore";
import type { User } from "../types/database";

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
          await fetchProfile(session.user.id);
          setSession(session);
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
            await fetchProfile(session.user.id);
            setSession(session);
          } else {
            setUser(null);
            setSession(null);
          }
          setLoading(false);
        }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }, [setSession, setUser, setLoading]);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setUser(data as User);
    } catch {
      setUser(null);
    }
  }
}
