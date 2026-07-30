import { supabase } from "./supabase";
import { createContent } from "./content";
import { saveVerifiedWork } from "./work";
import { createReview } from "./review";
import {
  clearGuestTrial,
  getGuestPendingReview,
  saveGuestPendingReview,
  type GuestPendingReview,
} from "../utils/guestStorage";
import { resolveLlmLanguage } from "../utils/llmLanguage";
import type { Work } from "../types/database";

// 게스트 체험으로 만든 평론을 로그인 계정으로 이전한다.
//
// 게스트는 서버에 아무것도 쓰지 않으므로(works/interviews/reviews 전부 없음) 여기서
// 작품 → 평론 → 사용량 기록 순으로 처음 만든다. 실패해도 로컬 데이터는 지우지 않는다 —
// 사용자가 애써 만든 평론이라 다음 기회에 재시도할 수 있어야 한다.
//
// 재시도 안전성: 위 3단계는 한 트랜잭션이 아니다(서로 다른 테이블 + Edge Function).
// 그래서 각 단계가 끝날 때마다 결과 id 를 로컬 보관분에 적어두고, 재시도 시 이미 끝난
// 단계는 건너뛴다. 이게 없으면 2단계에서 실패할 때마다 works/reviews 행이 새로 쌓인다.
// 마지막 단계(사용량 기록)는 서버에서 (user_id, action, ref_id) 유니크 인덱스로
// 멱등 처리되므로(claim-guest-review), 중복 호출해도 사용량이 두 번 차감되지 않는다.

let isMigrating = false;

// 사용량 기록만 계속 실패할 때의 재시도 상한. 평론 자체는 이미 이전됐으므로 여기서
// 포기해도 사용자가 잃는 것은 없다("오늘 무료 1편" 차감이 누락될 뿐).
const MAX_CLAIM_ATTEMPTS = 3;

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
 * 이전된 평론을 그 계정의 오늘 무료 1편으로 기록한다.
 *
 * 이게 없으면 "게스트 1편 + 로그인 후 1편 = 하루 2편" 우회가 된다. usage_logs 는
 * service-role 쓰기 전용(RLS)이라 클라이언트가 직접 못 넣어 Edge Function 을 거친다.
 *
 * supabase.functions.invoke 는 실패를 throw 하지 않고 `{ error }` 로 돌려준다 —
 * 이걸 확인하지 않으면 서버가 500 을 줘도 성공으로 오해한다.
 */
async function claimGuestReview(reviewId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("claim-guest-review", {
    body: { review_id: reviewId, language: resolveLlmLanguage() },
  });

  if (error) {
    throw new Error(`claim-guest-review invoke failed: ${error.message}`);
  }
  // 함수가 200 이 아닌 상태로 응답 본문에 에러를 실어 보내는 경우
  if (data?.error) {
    throw new Error(`claim-guest-review rejected: ${data.error} ${data.message ?? ""}`.trim());
  }
}

/** 진행 상태를 로컬 보관분에 반영한다. 저장 실패는 재시도 시 중복을 부를 뿐 이전을 막지 않는다. */
async function persistProgress(
  pending: GuestPendingReview,
  patch: Partial<GuestPendingReview>,
): Promise<GuestPendingReview> {
  const next = { ...pending, ...patch };
  try {
    await saveGuestPendingReview(next);
  } catch (e) {
    console.error("guestMigration: 진행 상태 저장 실패(재시도 시 중복 위험):", e);
  }
  return next;
}

/**
 * 보관 중인 게스트 평론이 있으면 계정으로 이전한다.
 * @returns 평론이 계정에 올라갔으면 true (보관분이 없거나 이전에 실패했으면 false)
 */
export async function migrateGuestReview(userId: string): Promise<boolean> {
  if (isMigrating) return false;
  isMigrating = true;
  try {
    let pending = await getGuestPendingReview();
    if (!pending) return false;

    // 이전 시도가 **다른 계정**에서 이뤄졌다면 그때 만든 행은 재사용하지 않는다.
    // 수동 입력 작품은 소유자만 읽을 수 있어(works RLS: is_verified=true OR user_id=auth.uid())
    // 남의 work 를 참조하는 평론은 히스토리에서 깨져 보인다.
    if (pending.migratedUserId && pending.migratedUserId !== userId) {
      pending = await persistProgress(pending, {
        migratedUserId: undefined,
        migratedWorkId: undefined,
        migratedReviewId: undefined,
        claimAttempts: undefined,
      });
    }

    // 1단계: 작품. 이전 시도에서 이미 만들었으면 그 id 를 재사용한다.
    let workId = pending.migratedWorkId;
    if (!workId) {
      const work = await resolveWork(userId, pending);
      workId = work.id;
      pending = await persistProgress(pending, {
        migratedUserId: userId,
        migratedWorkId: workId,
      });
    }

    // 2단계: 평론. 여기서 재사용하지 않으면 재시도할 때마다 같은 평론이 중복 저장된다.
    let reviewId = pending.migratedReviewId;
    if (!reviewId) {
      const review = await createReview({
        userId,
        workId,
        title: pending.title,
        body: pending.body,
        experienceDate: null,
      });
      reviewId = review.id;
      pending = await persistProgress(pending, { migratedReviewId: reviewId });
    }

    // 3단계: 사용량 기록. 실패하면 보관분을 남겨 다음 로그인에 재시도한다 —
    // 이때 1·2단계는 위 id 로 건너뛰므로 평론이 중복되지 않는다.
    try {
      await claimGuestReview(reviewId);
    } catch (e) {
      const attempts = (pending.claimAttempts ?? 0) + 1;
      console.error(
        `claim-guest-review failed (${attempts}/${MAX_CLAIM_ATTEMPTS}), review=${reviewId}:`,
        e,
      );

      if (attempts < MAX_CLAIM_ATTEMPTS) {
        await persistProgress(pending, { claimAttempts: attempts });
        // 평론은 이미 계정에 있으므로 이전 자체는 성공이다.
        return true;
      }
      // 상한 도달 — 무한 재시도로 로컬 보관분이 영구히 남는 것을 막고 정리한다.
      console.error("claim-guest-review 재시도 상한 도달 — 사용량 기록 없이 종료합니다.");
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
