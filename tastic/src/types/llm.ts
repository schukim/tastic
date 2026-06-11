import type { ContentCategory, ConversationEntry } from "./database";

// ── verify-content ──
export interface VerifyContentRequest {
  title: string;
  creator?: string;
  category: ContentCategory;
  language: "ko" | "en";
  // true면 글로벌 캐시를 건너뛰고 웹서치 강제('재검색' 버튼)
  skipCache?: boolean;
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

// verify-content 엣지 함수가 응답에 싣는 웹서치 탐색 트레이스(디버그용).
// 모델이 실제 인용한 출처/검색 횟수 등을 담는다.
export interface VerifyContentDebug {
  // 캐시 히트 여부 — '재검색' 버튼 노출 판단에 사용
  cache_hit?: boolean;
  source_work_id?: string;
  similarity?: number;
  ms: number;
  search_count: number;
  cited_domains: string[];
  citations?: { url: string; title: string | null }[];
  status?: string | null;
  incomplete_reason?: string | null;
  format_status?: string | null;
}

export interface VerifyContentResponse {
  candidates: ContentCandidate[];
  _debug?: VerifyContentDebug;
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
  question_type: "initial" | "deep" | "bridge" | "wide" | "wrap_up";
  topic_label: string;
  should_end?: boolean;
}

// ── generate-review ──
export interface GenerateReviewRequest {
  content: {
    title: string;
    category: ContentCategory;
    creator: string | null;
    year: number | null;
    genre: string | null;
  };
  conversation_history: ConversationEntry[];
  language: "ko" | "en";
  // 사용량 카운트 멱등 처리용 — 같은 인터뷰의 재생성은 중복 카운트하지 않음
  interview_id?: string | null;
  // true면 멤버십 전용 미리보기 (사용량 미차감)
  is_preview?: boolean;
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
