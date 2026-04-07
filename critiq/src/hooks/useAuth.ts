import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/authStore";
import type { User } from "../types/database";

export function useAuth() {
  const { setSession, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
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
    } finally {
      setLoading(false);
    }
  }
}
