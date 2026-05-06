import type { ContentCategory, Content, ConversationEntry } from "./database";

// Root
export type RootStackParamList = {
  Auth: undefined;
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
  };
};
