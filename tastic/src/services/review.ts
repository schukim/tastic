import type { Review, Interview, ConversationEntry } from "../types/database";
import type { Json } from "../types/supabase";
import { supabase } from "./supabase";
import { getUnsavedReviews, removeUnsavedReview } from "../utils/storage";

// ── Reviews ──

interface CreateReviewParams {
  userId: string;
  workId: string;
  title: string | null;
  body: string;
  experienceDate: string | null;
}

export async function createReview(params: CreateReviewParams): Promise<Review> {
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      user_id: params.userId,
      work_id: params.workId,
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

  // DB row(work_id nullable 등)를 좁은 도메인 타입으로 신뢰 변환
  return data as unknown as Review;
}

export interface ReviewWithContent extends Review {
  works: {
    id: string;
    title: string;
    category: string;
    creator: string | null;
    year: number | null;
  } | null;
}

// 저장 실패로 로컬(AsyncStorage)에 보관된 평론을 서버로 재업로드한다.
// 앱 시작(로그인 확인 후)과 히스토리 진입 시 호출 — 성공한 건만 로컬에서 제거하고,
// 실패한 건 다음 기회에 재시도한다.
let isSyncingUnsaved = false;

export async function syncUnsavedReviews(userId: string): Promise<void> {
  if (isSyncingUnsaved) return;
  isSyncingUnsaved = true;
  try {
    const pending = await getUnsavedReviews();
    for (const item of pending) {
      try {
        const review = await createReview({
          userId,
          workId: item.contentId,
          title: item.title,
          body: item.body,
          experienceDate: item.experienceDate,
        });
        if (item.interviewId) {
          await linkInterviewToReview(item.interviewId, review.id).catch(() => {});
        }
        await removeUnsavedReview(item.savedAt);
      } catch {
        // 여전히 실패 — 로컬에 남겨두고 다음 동기화 때 재시도
      }
    }
  } finally {
    isSyncingUnsaved = false;
  }
}

export async function fetchReviews(userId: string): Promise<ReviewWithContent[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, works(id, title, category, creator, year)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchReviews error:", error);
    throw new Error(`평론 조회에 실패했습니다: ${error.message}`);
  }

  return (data ?? []) as ReviewWithContent[];
}

export async function fetchReviewsByMonth(
  userId: string,
  year: number,
  month: number
): Promise<ReviewWithContent[]> {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

  const { data, error } = await supabase
    .from("reviews")
    .select("*, works(id, title, category, creator, year)")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchReviewsByMonth error:", error);
    throw new Error(`월별 평론 조회에 실패했습니다: ${error.message}`);
  }

  return (data ?? []) as ReviewWithContent[];
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
  if (title !== undefined) updateData.title = title;

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

  return data as unknown as Review;
}

// ── Interviews ──

interface CreateInterviewParams {
  userId: string;
  workId: string;
}

export async function createInterview(params: CreateInterviewParams): Promise<Interview> {
  const { data, error } = await supabase
    .from("interviews")
    .insert({
      user_id: params.userId,
      work_id: params.workId,
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

  return data as unknown as Interview;
}

export async function updateInterview(
  interviewId: string,
  conversation: ConversationEntry[],
  questionCount: number,
  status?: "in_progress" | "completed" | "abandoned"
): Promise<void> {
  const { error } = await supabase
    .from("interviews")
    .update({
      // conversation 컬럼은 jsonb
      conversation: conversation as unknown as Json,
      question_count: questionCount,
      ...(status ? { status } : {}),
    })
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
