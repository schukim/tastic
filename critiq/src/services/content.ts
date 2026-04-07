import { supabase } from "./supabase";
import type { Content, ContentCategory } from "../types/database";

interface CreateContentParams {
  userId: string;
  title: string;
  originalTitle?: string;
  category: ContentCategory;
  creator?: string;
  year?: number;
  genre?: string;
  metadata?: Record<string, unknown>;
}

export async function createContent(params: CreateContentParams): Promise<Content> {
  const { data, error } = await supabase
    .from("contents")
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

  if (error) throw error;
  return data as Content;
}
