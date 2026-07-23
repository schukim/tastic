import { supabase } from "./supabase";
import type { Recommendation, RecommendationItem } from "../types/database";
import type { Json } from "../types/supabase";

/**
 * @deprecated 추천 저장은 서버(recommend-content Edge Function)가 검증 후 수행한다.
 * 클라이언트 저장은 미검증 결과를 그대로 남기므로 사용하지 않는다. 히스토리 조회는 fetchRecommendations 사용.
 */
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
