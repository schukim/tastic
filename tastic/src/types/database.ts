export type ContentCategory =
  | "movie"
  | "music"
  | "book"
  | "art"
  | "series";

export type InterviewStatus = "in_progress" | "completed" | "abandoned";

export type Language = "ko" | "en";

export interface User {
  id: string;
  nickname: string;
  avatar_url: string | null;
  preferred_categories: ContentCategory[];
  language: Language;
  created_at: string;
}

export interface Work {
  id: string;
  user_id: string | null;
  category: ContentCategory;
  title: string;
  original_title: string | null;
  creator: string | null;
  year: number | null;
  genre: string | null;
  title_normalized: string | null;
  metadata: Record<string, unknown>;
  primary_source: string | null;
  contributing_sources: string[];
  external_ids: Record<string, string>;
  last_synced_at: string | null;
  sync_status: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Content는 Work의 별칭 (네비게이션 파라미터 등 기존 코드 호환)
export type Content = Work;

export interface Review {
  id: string;
  user_id: string;
  work_id: string;
  title: string | null;
  body: string;
  experience_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationEntry {
  role: "interviewer" | "user";
  text: string;
  question_type?: "initial" | "deep" | "wide" | "wrap_up";
  topic_label?: string;
}

export interface Interview {
  id: string;
  review_id: string | null;
  user_id: string;
  work_id: string;
  conversation: ConversationEntry[];
  question_count: number;
  status: InterviewStatus;
  created_at: string;
  updated_at: string;
}

export interface TasteProfile {
  id: string;
  user_id: string;
  profile_sentences: string[];
  recommendation_hook: string | null;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export interface Recommendation {
  id: string;
  user_id: string;
  prompt: string | null;
  results: RecommendationItem[];
  created_at: string;
}

export interface RecommendationItem {
  title: string;
  category: ContentCategory;
  creator: string;
  year: number | null;
  reason: string;
  reason_short: string;
}

// Placeholder — run `npm run db:types` with a live Supabase instance to generate
// the full Database type.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Database {}
