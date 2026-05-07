import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Content, ConversationEntry } from "../types/database";

const DRAFT_KEY = "tastic_interview_draft";
const UNSAVED_REVIEWS_KEY = "tastic_unsaved_reviews";
const DRAFT_EXPIRY_DAYS = 7;

export interface StoredDraft {
  content: Content;
  conversation: ConversationEntry[];
  questionCount: number;
  interviewId: string | null;
  savedAt: string;
}

export interface UnsavedReview {
  contentId: string;
  title: string | null;
  body: string;
  experienceDate: string | null;
  interviewId: string;
  savedAt: string;
}

// ── Interview Draft ──

export async function saveDraft(draft: StoredDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadDraft(): Promise<StoredDraft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return null;

  const draft: StoredDraft = JSON.parse(raw);
  const savedAt = new Date(draft.savedAt);
  const now = new Date();
  const diffDays = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays > DRAFT_EXPIRY_DAYS) {
    await clearDraft();
    return null;
  }

  return draft;
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

// ── Unsaved Reviews ──

export async function saveUnsavedReview(review: UnsavedReview): Promise<void> {
  const existing = await getUnsavedReviews();
  existing.push(review);
  await AsyncStorage.setItem(UNSAVED_REVIEWS_KEY, JSON.stringify(existing));
}

export async function getUnsavedReviews(): Promise<UnsavedReview[]> {
  const raw = await AsyncStorage.getItem(UNSAVED_REVIEWS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearUnsavedReviews(): Promise<void> {
  await AsyncStorage.removeItem(UNSAVED_REVIEWS_KEY);
}

export async function removeUnsavedReview(interviewId: string): Promise<void> {
  const existing = await getUnsavedReviews();
  const filtered = existing.filter((r) => r.interviewId !== interviewId);
  await AsyncStorage.setItem(UNSAVED_REVIEWS_KEY, JSON.stringify(filtered));
}
