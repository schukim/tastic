export type ContentCategory =
  | "movie"
  | "music"
  | "book"
  | "art";

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

export interface Content {
  id: string;
  user_id: string;
  title: string;
  original_title: string | null;
  category: ContentCategory;
  creator: string | null;
  year: number | null;
  genre: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  content_id: string;
  title: string | null;
  body: string;
  experience_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationEntry {
  role: "interviewer" | "user";
  text: string;
  question_type?: "initial" | "drill_down" | "pivot";
  topic_label?: string;
}

export interface Interview {
  id: string;
  review_id: string | null;
  user_id: string;
  content_id: string;
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
// the full Database type. Until then, we use a minimal shape so the client compiles.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Database {}
