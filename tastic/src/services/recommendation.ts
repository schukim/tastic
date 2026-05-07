import { supabase } from "./supabase";
import type { Recommendation } from "../types/database";

export async function saveRecommendation(
  userId: string,
  prompt: string,
  results: unknown[]
): Promise<Recommendation> {
  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      user_id: userId,
      prompt,
      results,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Recommendation;
}

export async function fetchRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from("recommendations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as Recommendation[];
}
