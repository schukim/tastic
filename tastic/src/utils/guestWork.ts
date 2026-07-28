import * as Crypto from "expo-crypto";
import type { Work } from "../types/database";
import type { GuestWork } from "./guestStorage";

// 게스트는 works 행을 만들지 않는다(RLS 상 client insert 에 user_id 가 필요하고,
// 무엇보다 체험 도중 서버에 데이터를 남기지 않기 위함). 대신 인터뷰 화면이 요구하는
// Work 형태를 메모리에서만 만들어 넘긴다. 실제 works 행은 로그인 후 이전 시점에
// guestMigration 이 생성한다.
//
// id 는 로컬 전용 UUID 다 — 서버로 전송되지 않으며(게스트는 인터뷰 레코드를 만들지 않음)
// 화면 간 식별용으로만 쓰인다.

export function guestWorkToLocalWork(work: GuestWork): Work {
  const now = new Date().toISOString();
  return {
    id: Crypto.randomUUID(),
    user_id: null,
    category: work.category,
    title: work.title,
    original_title: work.originalTitle ?? null,
    creator: work.creator ?? null,
    year: work.year ?? null,
    genre: work.genre ?? null,
    title_normalized: null,
    metadata: work.metadata ?? {},
    primary_source: null,
    contributing_sources: [],
    external_ids: {},
    last_synced_at: null,
    sync_status: "pending",
    is_verified: false,
    created_at: now,
    updated_at: now,
  };
}
