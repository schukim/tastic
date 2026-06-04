import { supabase } from "./supabase";
import type { ContentCategory } from "../types/database";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

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
    path: "/auth/callback",
  });

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

  // Open the OAuth provider's authentication URL
  if (data.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo
    );

    if (result.type === "success") {
      const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (sessionError) throw sessionError;
      return sessionData;
    }
  }

  return data;
}

export async function signInWithApple() {
  const redirectTo = makeRedirectUri({
    path: "/auth/callback",
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
      const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (sessionError) throw sessionError;
      return sessionData;
    }
  }

  return data;
}
