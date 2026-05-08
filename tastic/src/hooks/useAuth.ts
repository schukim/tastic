import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/authStore";
import type { User } from "../types/database";

export function useAuth() {
  const { setSession, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await fetchProfile(session.user.id);
          setSession(session);
        } else {
          setUser(null);
          setSession(null);
        }
        setLoading(false);
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
