import type { Review, Interview, ConversationEntry } from "../types/database";
import { supabase } from "./supabase";

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

  if (error) {
    console.error("createReview error:", error);
    throw new Error(`평론 저장에 실패했습니다: ${error.message}`);
  }

  return data;
}

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
  // 외래키 제약조건이 없으므로 별도 쿼리로 조회
  const { data: reviews, error: reviewError } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (reviewError) {
    console.error("fetchReviews review error:", reviewError);
    throw new Error(`평론 조회에 실패했습니다: ${reviewError.message}`);
  }

  if (!reviews || reviews.length === 0) {
    return [];
  }

  // content_id 목록 추출
  const contentIds = reviews.map(r => r.content_id);

  // 관련된 contents 조회
  const { data: contents, error: contentError } = await supabase
    .from("contents")
    .select("id, title, category, creator, year")
    .in("id", contentIds);

  if (contentError) {
    console.error("fetchReviews content error:", contentError);
    // contents 조회 실패해도 reviews만 반환
  }

  // reviews와 contents 조합
  const reviewsWithContent: ReviewWithContent[] = reviews.map(review => ({
    ...review,
    contents: contents?.find(c => c.id === review.content_id) || {
      id: review.content_id,
      title: "알 수 없는 작품",
      category: "movie",
      creator: null,
      year: null,
    }
  }));

  return reviewsWithContent;
}

export async function fetchReviewsByMonth(
  userId: string,
  year: number,
  month: number
): Promise<ReviewWithContent[]> {
  // 해당 월의 첫째 날과 마지막 날 계산
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

  // 외래키 제약조건이 없으므로 별도 쿼리로 조회
  const { data: reviews, error: reviewError } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });

  if (reviewError) {
    console.error("fetchReviewsByMonth review error:", reviewError);
    throw new Error(`월별 평론 조회에 실패했습니다: ${reviewError.message}`);
  }

  if (!reviews || reviews.length === 0) {
    return [];
  }

  // content_id 목록 추출
  const contentIds = reviews.map(r => r.content_id);

  // 관련된 contents 조회
  const { data: contents, error: contentError } = await supabase
    .from("contents")
    .select("id, title, category, creator, year")
    .in("id", contentIds);

  if (contentError) {
    console.error("fetchReviewsByMonth content error:", contentError);
    // contents 조회 실패해도 reviews만 반환
  }

  // reviews와 contents 조합
  const reviewsWithContent: ReviewWithContent[] = reviews.map(review => ({
    ...review,
    contents: contents?.find(c => c.id === review.content_id) || {
      id: review.content_id,
      title: "알 수 없는 작품",
      category: "movie",
      creator: null,
      year: null,
    }
  }));

  console.log(`Found ${reviewsWithContent.length} reviews for ${year}-${month}`);
  return reviewsWithContent;
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId);

  if (error) {
    console.error("deleteReview error:", error);
    throw new Error(`평론 삭제에 실패했습니다: ${error.message}`);
  }
}

export async function updateReview(reviewId: string, body: string, title?: string): Promise<Review> {
  const updateData: Partial<Review> = { body };
  if (title !== undefined) {
    updateData.title = title;
  }

  const { data, error } = await supabase
    .from("reviews")
    .update(updateData)
    .eq("id", reviewId)
    .select()
    .single();

  if (error) {
    console.error("updateReview error:", error);
    throw new Error(`평론 수정에 실패했습니다: ${error.message}`);
  }

  return data;
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

  if (error) {
    console.error("createInterview error:", error);
    throw new Error(`인터뷰 생성에 실패했습니다: ${error.message}`);
  }

  return data;
}

export async function updateInterview(
  interviewId: string,
  conversation: ConversationEntry[],
  questionCount: number,
  status?: "in_progress" | "completed" | "abandoned"
): Promise<void> {
  const updateData: Partial<Interview> = {
    conversation,
    question_count: questionCount,
  };

  if (status) {
    updateData.status = status;
  }

  const { error } = await supabase
    .from("interviews")
    .update(updateData)
    .eq("id", interviewId);

  if (error) {
    console.error("updateInterview error:", error);
    throw new Error(`인터뷰 업데이트에 실패했습니다: ${error.message}`);
  }
}

export async function linkInterviewToReview(interviewId: string, reviewId: string): Promise<void> {
  const { error } = await supabase
    .from("interviews")
    .update({ review_id: reviewId })
    .eq("id", interviewId);

  if (error) {
    console.error("linkInterviewToReview error:", error);
    throw new Error(`인터뷰와 평론 연결에 실패했습니다: ${error.message}`);
  }
}