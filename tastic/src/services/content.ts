import type { Content, ContentCategory } from "../types/database";
import { supabase } from "./supabase";

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
  console.log("createContent called with params:", params);

  // 현재 auth 상태 확인
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  console.log("Current auth session:", session?.user?.id);
  console.log("Session error:", sessionError);

  // 사용자가 users 테이블에 존재하는지 확인
  const { data: existingUser, error: userCheckError } = await supabase
    .from('users')
    .select('id, nickname')
    .eq('id', params.userId)
    .single();

  console.log("User check result:", { existingUser, userCheckError });

  // 사용자가 없으면 생성
  if (!existingUser && userCheckError?.code === 'PGRST116') {
    console.log("Creating missing user in public.users table...");
    const { data: newUser, error: createUserError } = await supabase
      .from('users')
      .insert({
        id: params.userId,
        nickname: '테스터',
        avatar_url: null,
        preferred_categories: [],
        language: 'ko'
      })
      .select()
      .single();

    if (createUserError) {
      console.error("Error creating user:", createUserError);
    } else {
      console.log("User created successfully:", newUser);
    }
  }

  const insertData = {
    user_id: params.userId,
    title: params.title,
    original_title: params.originalTitle || null,
    category: params.category,
    creator: params.creator || null,
    year: params.year || null,
    genre: params.genre || null,
    metadata: params.metadata || {},
  };

  console.log("Inserting content data:", insertData);

  const { data, error } = await supabase
    .from("contents")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("createContent error details:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`작품 정보 저장에 실패했습니다 (${error.code}): ${error.message}`);
  }

  console.log("Content created successfully:", data);
  return data;
}

export async function fetchContentsByUser(userId: string): Promise<Content[]> {
  const { data, error } = await supabase
    .from("contents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchContentsByUser error:", error);
    throw new Error(`작품 목록 조회에 실패했습니다: ${error.message}`);
  }

  return data;
}

export async function findOrCreateContent(
  userId: string,
  contentInfo: {
    title: string;
    category: ContentCategory;
    creator?: string;
    year?: number;
    genre?: string;
    original_title?: string;
  }
): Promise<Content> {
  // 먼저 동일한 작품이 있는지 확인
  const { data: existingContent, error: searchError } = await supabase
    .from("contents")
    .select("*")
    .eq("user_id", userId)
    .eq("title", contentInfo.title)
    .eq("category", contentInfo.category)
    .eq("creator", contentInfo.creator || null)
    .limit(1)
    .single();

  if (searchError && searchError.code !== "PGRST116") {
    // PGRST116은 "no rows returned" 에러
    console.error("findOrCreateContent search error:", searchError);
    throw new Error(`작품 검색에 실패했습니다: ${searchError.message}`);
  }

  if (existingContent) {
    return existingContent;
  }

  // 기존 작품이 없으면 새로 생성
  return createContent({
    userId,
    title: contentInfo.title,
    originalTitle: contentInfo.original_title,
    category: contentInfo.category,
    creator: contentInfo.creator,
    year: contentInfo.year,
    genre: contentInfo.genre,
  });
}