import type { ContentCategory, Content, ConversationEntry } from "./database";

// Root
export type RootStackParamList = {
  Loading: undefined;
  Auth: undefined;
  ProfileError: undefined;
  Onboarding: undefined;
  IntroTour: undefined;
  Main: undefined;
};

// Auth Stack
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

// Main Bottom Tabs
export type MainTabParamList = {
  HistoryTab: undefined;
  RecommendTab: undefined;
  ReviewTab: undefined;
  AnalysisTab: undefined;
  MyTab: undefined;
};

// Review Stack (within ReviewTab)
export type ReviewStackParamList = {
  ReviewHome: undefined;
  ContentConfirm: {
    title: string;
    creator: string;
    category: ContentCategory;
    experienceDate: string;
    musicType?: "album" | "song";
  };
  Interview: {
    content: Content;
  };
  ReviewComplete: {
    content: Content;
    conversation: ConversationEntry[];
    interviewId: string;
    // 미리보기에서 이미 생성한 평론 — 있으면 진입 시 재생성(LLM 재호출)을 건너뛴다
    initialReview?: {
      reviewText: string;
      suggestedTitle: string;
    };
  };
};
