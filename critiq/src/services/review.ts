import type { Review, Interview, ConversationEntry } from "../types/database";

function mockUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Reviews ──

interface CreateReviewParams {
  userId: string;
  contentId: string;
  title: string | null;
  body: string;
  experienceDate: string | null;
}

// MOCK: DB write bypassed for testing
export async function createReview(params: CreateReviewParams): Promise<Review> {
  const now = new Date().toISOString();
  return {
    id: mockUuid(),
    user_id: params.userId,
    content_id: params.contentId,
    title: params.title,
    body: params.body,
    experience_date: params.experienceDate,
    created_at: now,
    updated_at: now,
  };
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

// MOCK: returns empty list
export async function fetchReviews(_userId: string): Promise<ReviewWithContent[]> {
  return [];
}

// MOCK: returns empty list
export async function fetchReviewsByMonth(
  _userId: string,
  _year: number,
  _month: number
): Promise<ReviewWithContent[]> {
  return [];
}

// MOCK: no-op
export async function deleteReview(_reviewId: string): Promise<void> {
  return;
}

// MOCK: returns stub
export async function updateReview(reviewId: string, body: string, title?: string): Promise<Review> {
  const now = new Date().toISOString();
  return {
    id: reviewId,
    user_id: "",
    content_id: "",
    title: title ?? null,
    body,
    experience_date: null,
    created_at: now,
    updated_at: now,
  };
}

// ── Interviews ──

interface CreateInterviewParams {
  userId: string;
  contentId: string;
}

// MOCK: DB write bypassed for testing
export async function createInterview(params: CreateInterviewParams): Promise<Interview> {
  const now = new Date().toISOString();
  return {
    id: mockUuid(),
    review_id: null,
    user_id: params.userId,
    content_id: params.contentId,
    conversation: [],
    question_count: 0,
    status: "in_progress",
    created_at: now,
    updated_at: now,
  };
}

// MOCK: no-op
export async function updateInterview(
  _interviewId: string,
  _conversation: ConversationEntry[],
  _questionCount: number,
  _status?: "in_progress" | "completed" | "abandoned"
): Promise<void> {
  return;
}

// MOCK: no-op
export async function linkInterviewToReview(_interviewId: string, _reviewId: string): Promise<void> {
  return;
}
