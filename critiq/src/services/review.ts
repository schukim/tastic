import { supabase } from "./supabase";
import type { Review, Interview, ConversationEntry } from "../types/database";

// ── Reviews ──

interface CreateReviewParams {
  userId: string;
  contentId: string;
  title: string | null;
  body: string;
  experienceDate: string | null;
}

export async function createReview(params: CreateReviewParams): Promise<Review> {
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      user_id: params.userId,
      content_id: params.contentId,
      title: params.title,
      body: params.body,
      experience_date: params.experienceDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Review;
}

// 평론 + 콘텐츠 정보 조인 타입
export interface ReviewWithContent extends Review {
  contents: {
    id: string;
    title: string;
    category: string;
    creator: string | null;
    year: number | null;
  };
}

export async function fetchReviews(userId: string): Promise<ReviewWithContent[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, contents(id, title, category, creator, year)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReviewWithContent[];
}

export async function fetchReviewsByMonth(
  userId: string,
  year: number,
  month: number
): Promise<ReviewWithContent[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("reviews")
    .select("*, contents(id, title, category, creator, year)")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReviewWithContent[];
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export async function updateReview(reviewId: string, body: string, title?: string): Promise<Review> {
  const update: Record<string, unknown> = { body };
  if (title !== undefined) update.title = title;

  const { data, error } = await supabase
    .from("reviews")
    .update(update)
    .eq("id", reviewId)
    .select()
    .single();

  if (error) throw error;
  return data as Review;
}

// ── Interviews ──

interface CreateInterviewParams {
  userId: string;
  contentId: string;
}

export async function createInterview(params: CreateInterviewParams): Promise<Interview> {
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      user_id: params.userId,
      content_id: params.contentId,
      conversation: [],
      question_count: 0,
      status: "in_progress",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Interview;
}

export async function updateInterview(
  interviewId: string,
  conversation: ConversationEntry[],
  questionCount: number,
  status?: "in_progress" | "completed" | "abandoned"
): Promise<void> {
  const update: Record<string, unknown> = { conversation, question_count: questionCount };
  if (status) update.status = status;

  const { error } = await supabase
    .from("interviews")
    .update(update)
    .eq("id", interviewId);

  if (error) throw error;
}

export async function linkInterviewToReview(interviewId: string, reviewId: string): Promise<void> {
  const { error } = await supabase
    .from("interviews")
    .update({ review_id: reviewId, status: "completed" })
    .eq("id", interviewId);

  if (error) throw error;
}
