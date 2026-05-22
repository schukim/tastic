import type { Work, ContentCategory } from "../types/database";
import { supabase } from "./supabase";

interface CreateWorkParams {
  userId: string;
  title: string;
  category: ContentCategory;
  originalTitle?: string;
  creator?: string;
  year?: number;
  genre?: string;
  metadata?: Record<string, unknown>;
}

export async function createWork(params: CreateWorkParams): Promise<Work> {
  const { data, error } = await supabase
    .from("works")
    .insert({
      user_id: params.userId,
      title: params.title,
      original_title: params.originalTitle ?? null,
      category: params.category,
      creator: params.creator ?? null,
      year: params.year ?? null,
      genre: params.genre ?? null,
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error("createWork error:", error);
    throw new Error(`작품 정보 저장에 실패했습니다 (${error.code}): ${error.message}`);
  }

  return data;
}

export async function fetchWorksByUser(userId: string): Promise<Work[]> {
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchWorksByUser error:", error);
    throw new Error(`작품 목록 조회에 실패했습니다: ${error.message}`);
  }

  return data;
}

// 동일 작품이 카탈로그에 있으면 재사용, 없으면 새로 생성.
// search_works RPC로 외부 ingestion 작품도 매칭한다.
export async function findOrCreateWork(
  userId: string,
  contentInfo: {
    title: string;
    category: ContentCategory;
    originalTitle?: string;
    creator?: string;
    year?: number;
    genre?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Work> {
  const { data: matches, error: searchError } = await supabase.rpc("search_works", {
    query_text: contentInfo.title,
    target_category: contentInfo.category,
    limit_count: 5,
  });

  if (searchError) {
    console.error("findOrCreateWork search error:", searchError);
  }

  const best = matches?.[0];
  if (best && best.similarity_score >= 0.85) {
    const { data, error } = await supabase
      .from("works")
      .select("*")
      .eq("id", best.id)
      .single();
    if (!error && data) return data;
  }

  return createWork({
    userId,
    title: contentInfo.title,
    originalTitle: contentInfo.originalTitle,
    category: contentInfo.category,
    creator: contentInfo.creator,
    year: contentInfo.year,
    genre: contentInfo.genre,
    metadata: contentInfo.metadata,
  });
}
