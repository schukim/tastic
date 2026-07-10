import { supabase } from "./supabase";
import type { Recommendation, RecommendationItem } from "../types/database";
import type { Json } from "../types/supabase";

export async function saveRecommendation(
  userId: string,
  prompt: string,
  results: RecommendationItem[]
): Promise<Recommendation> {
  const { data, error } = await supabase
    .from("recommendations")
    .insert({
      user_id: userId,
      prompt,
      // DB 컬럼은 jsonb — 도메인 타입을 Json 으로 넘긴다
      results: results as unknown as Json,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Recommendation;
}

export async function fetchRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from("recommendations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as unknown as Recommendation[];
}
