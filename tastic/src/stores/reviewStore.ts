import { create } from "zustand";
import type { Content, ConversationEntry } from "../types/database";

interface InterviewDraft {
  content: Content;
  conversation: ConversationEntry[];
  questionCount: number;
  interviewId: string | null;
  savedAt: string;
}

interface ReviewState {
  currentDraft: InterviewDraft | null;
  isGenerating: boolean;
  setDraft: (draft: InterviewDraft | null) => void;
  setGenerating: (generating: boolean) => void;
  reset: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  currentDraft: null,
  isGenerating: false,
  setDraft: (currentDraft) => set({ currentDraft }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  reset: () => set({ currentDraft: null, isGenerating: false }),
}));
