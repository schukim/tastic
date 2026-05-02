import type { ContentCategory, ConversationEntry } from "./database";

// ── verify-content ──
export interface VerifyContentRequest {
  title: string;
  creator?: string;
  category: ContentCategory;
  language: "ko" | "en";
}

export interface ContentCandidate {
  title: string;
  original_title: string | null;
  creator: string | null;
  year: number | null;
  genre: string | null;
  metadata: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
}

export interface VerifyContentResponse {
  candidates: ContentCandidate[];
}

// ── generate-question ──
export interface GenerateQuestionRequest {
  content: {
    title: string;
    category: ContentCategory;
    creator: string | null;
    year: number | null;
    genre: string | null;
    metadata: Record<string, unknown>;
  };
  conversation_history: ConversationEntry[];
  question_count: number;
  language: "ko" | "en";
}

export interface GenerateQuestionResponse {
  question: string;
  question_type: "initial" | "drill_down" | "pivot";
  topic_label: string;
}

// ── generate-review ──
export interface GenerateReviewRequest {
  content: {
    title: string;
    category: ContentCategory;
    creator: string | null;
    year: number | null;
  };
  conversation_history: ConversationEntry[];
  language: "ko" | "en";
}

export interface GenerateReviewResponse {
  review_text: string;
  suggested_title: string;
}

// ── analyze-taste ──
export interface AnalyzeTasteRequest {
  reviews: {
    content_title: string;
    category: ContentCategory;
    review_text: string;
    created_at: string;
  }[];
  previous_profile: string | null;
  language: "ko" | "en";
}

export interface AnalyzeTasteResponse {
  profile_sentences: string[];
  recommendation_hook: string;
}

// ── recommend-content ──
export interface RecommendContentRequest {
  taste_profile: string[];
  user_prompt: string;
  review_history: {
    content_title: string;
    category: ContentCategory;
  }[];
  language: "ko" | "en";
}

export interface RecommendContentResponse {
  recommendations: {
    title: string;
    category: ContentCategory;
    creator: string;
    year: number | null;
    reason: string;
    reason_short: string;
  }[];
}

// ── 공통 에러 ──
export interface LLMErrorResponse {
  error: string;
  message: string;
}
