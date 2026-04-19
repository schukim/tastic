import type { Content, ContentCategory } from "../types/database";

interface CreateContentParams {
  userId: string;
  title: string;
  originalTitle?: string;
  category: ContentCategory;
  creator?: string;
  year?: number;
  genre?: string;
  metadata?: Record<string, unknown>;
}

function mockUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// MOCK: DB write bypassed for testing (no real auth session)
export async function createContent(params: CreateContentParams): Promise<Content> {
  return {
    id: mockUuid(),
    user_id: params.userId,
    title: params.title,
    original_title: params.originalTitle ?? null,
    category: params.category,
    creator: params.creator ?? null,
    year: params.year ?? null,
    genre: params.genre ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date().toISOString(),
  };
}
