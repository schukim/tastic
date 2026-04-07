import { supabase } from "./supabase";
import type { ContentCategory } from "../types/database";

interface SignUpParams {
  email: string;
  password: string;
  nickname: string;
  preferredCategories: ContentCategory[];
  avatarUrl?: string;
}

export async function signUp({ email, password, nickname, preferredCategories, avatarUrl }: SignUpParams) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nickname },
    },
  });

  if (error) throw error;

  // Update profile with additional fields
  if (data.user) {
    const { error: profileError } = await supabase
      .from("users")
      .update({
        nickname,
        preferred_categories: preferredCategories,
        avatar_url: avatarUrl ?? null,
      })
      .eq("id", data.user.id);

    if (profileError) throw profileError;
  }

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

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
  });
  if (error) throw error;
  return data;
}

export async function signInWithApple() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
  });
  if (error) throw error;
  return data;
}
