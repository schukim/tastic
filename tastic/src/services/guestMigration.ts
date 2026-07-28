import { supabase } from "./supabase";
import { createContent } from "./content";
import { saveVerifiedWork } from "./work";
import { createReview } from "./review";
import {
  clearGuestTrial,
  getGuestPendingReview,
  type GuestPendingReview,
} from "../utils/guestStorage";
import type { Work } from "../types/database";

// 게스트 체험으로 만든 평론을 로그인 계정으로 이전한다.
//
// 게스트는 서버에 아무것도 쓰지 않으므로(works/interviews/reviews 전부 없음) 여기서
// 작품 → 평론 순으로 처음 만든다. 실패해도 로컬 데이터는 지우지 않는다 —
// 사용자가 애써 만든 평론이라 다음 기회에 재시도할 수 있어야 한다.

let isMigrating = false;

async function resolveWork(userId: string, pending: GuestPendingReview): Promise<Work> {
  const { work } = pending;

  // verify-content 로 식별된 작품만 is_verified 승격 경로(save-verified-work)를 태운다.
  // 수동 입력을 이 경로로 보내면 검증되지 않은 메타데이터가 전역 캐시를 오염시킨다.
  if (work.verified) {
    return saveVerifiedWork({
      title: work.title,
      originalTitle: work.originalTitle ?? undefined,
      category: work.category,
      creator: work.creator ?? undefined,
      year: work.year ?? undefined,
      genre: work.genre ?? undefined,
      metadata: work.metadata,
    });
  }

  return createContent({
    userId,
    title: work.title,
    originalTitle: work.originalTitle ?? undefined,
    category: work.category,
    creator: work.creator ?? undefined,
    year: work.year ?? undefined,
    genre: work.genre ?? undefined,
    metadata: work.metadata,
  });
}

/**
 * 보관 중인 게스트 평론이 있으면 계정으로 이전한다.
 * @returns 이전이 실제로 일어났으면 true (보관분이 없으면 false)
 */
export async function migrateGuestReview(userId: string): Promise<boolean> {
  if (isMigrating) return false;
  isMigrating = true;
  try {
    const pending = await getGuestPendingReview();
    if (!pending) return false;

    const work = await resolveWork(userId, pending);

    const review = await createReview({
      userId,
      workId: work.id,
      title: pending.title,
      body: pending.body,
      experienceDate: null,
    });

    // 이전된 평론은 그 계정의 오늘 무료 1편을 쓴 것으로 기록한다 —
    // 이게 없으면 "게스트 1편 + 로그인 후 1편 = 하루 2편" 우회가 된다.
    // 기록 실패가 이전 자체를 되돌릴 이유는 없으므로 평론은 그대로 둔다.
    try {
      await supabase.functions.invoke("claim-guest-review", {
        body: { review_id: review.id },
      });
    } catch (e) {
      console.error("claim-guest-review failed:", e);
    }

    await clearGuestTrial();
    return true;
  } catch (e) {
    // 로컬 보관분은 남겨둔다 — 다음 로그인/재시도 때 다시 이전한다
    console.error("migrateGuestReview failed:", e);
    return false;
  } finally {
    isMigrating = false;
  }
}
