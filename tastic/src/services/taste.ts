import { supabase } from "./supabase";
import type { TasteProfile } from "../types/database";

export async function getLatestTasteProfile(userId: string): Promise<TasteProfile | null> {
  const { data, error } = await supabase
    .from("taste_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as TasteProfile;
}

export async function saveTasteProfile(
  userId: string,
  profileSentences: string[],
  recommendationHook: string,
  reviewCount: number
): Promise<TasteProfile> {
  const { data, error } = await supabase
    .from("taste_profiles")
    .insert({
      user_id: userId,
      profile_sentences: profileSentences,
      recommendation_hook: recommendationHook,
      review_count: reviewCount,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TasteProfile;
}

export async function getReviewCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return 0;
  return count ?? 0;
}
