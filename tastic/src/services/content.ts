// content.ts — works 테이블 위임 레이어
// ContentConfirmScreen 등 기존 호출부 인터페이스를 유지하면서 works 테이블을 사용한다.
import type { Work, ContentCategory } from "../types/database";
import { findOrCreateWork } from "./work";

export type { Work as Content };

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

export async function createContent(params: CreateContentParams): Promise<Work> {
  return findOrCreateWork(params.userId, {
    title: params.title,
    originalTitle: params.originalTitle,
    category: params.category,
    creator: params.creator,
    year: params.year,
    genre: params.genre,
    metadata: params.metadata,
  });
}

export async function findOrCreateContent(
  userId: string,
  contentInfo: {
    title: string;
    category: ContentCategory;
    creator?: string;
    year?: number;
    genre?: string;
    original_title?: string;
  }
): Promise<Work> {
  return findOrCreateWork(userId, {
    title: contentInfo.title,
    originalTitle: contentInfo.original_title,
    category: contentInfo.category,
    creator: contentInfo.creator,
    year: contentInfo.year,
    genre: contentInfo.genre,
  });
}
