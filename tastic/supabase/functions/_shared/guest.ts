import { adminClient } from "./usage.ts";

// ── 게스트(비로그인 체험) 게이트 ──
//
// App Store 5.1.1(v) 대응으로 로그인 없이 인터뷰 1회 → 평론 생성까지 체험할 수 있어야 한다.
// 게스트는 Supabase 세션이 없으므로(익명 인증 미사용) JWT 로 식별할 수 없다. 대신
// 클라이언트가 기기 로컬에 만들어 보관하는 UUID 를 x-guest-id 헤더로 보내고,
// 서버는 guest_usage 테이블로 기기당/전역 일일 상한을 건다.
//
// 신뢰 수준: guest_id 는 클라이언트가 만드는 값이라 위조·회전이 가능하다. 기기당 상한은
// 정상 사용자용 가드레일일 뿐이고, 실질적인 비용 상한은 전역 일일 상한(GUEST_GLOBAL_LIMITS)이다.
// 게스트 경로에서는 유저 데이터를 일절 읽거나 쓰지 않으므로 위조로 얻을 수 있는 것은
// "LLM 호출 몇 번"뿐이며, 그 총량이 전역 상한으로 못박혀 있다.

// 게스트가 실제로 호출하는 함수만 — 작품 확정(work_save)은 게스트 경로에서 서버에
// 아무것도 쓰지 않으므로(로컬 Work 로 인터뷰만 진행) 여기 없다.
export type GuestAction = "search" | "question" | "review";

// 기기당 일일 상한. 정상 체험은 1회(검색 1~3 + 질문 5 + 평론 1~2)로 끝나므로
// 재시도·재검색 여유를 준 값이다. (질문은 6문답 중 1턴이 클라이언트 캐시라 5회 호출)
const GUEST_DEVICE_LIMITS: Record<GuestAction, number> = {
  search: 8,
  question: 15,
  review: 3,
};

// 액션별 전역 일일 상한(서킷 브레이커). 기기 UUID 는 위조 가능하므로 실질적인 비용
// 상한은 이 값이다. 특히 search 는 web_search(gpt-4.1) 라 건당 비용이 가장 크다.
// 게스트 1명당 정상 사용량이 search 1~2건이므로 하루 300명분에 해당한다.
// 여기 걸리면 게스트 체험만 일시 마감되고 로그인 사용자는 영향받지 않는다.
const GUEST_GLOBAL_LIMITS: Record<GuestAction, number> = {
  search: 300,
  question: 800,
  review: 300,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// KST 기준 날짜 — usage.ts 의 하루 경계(Asia/Seoul)와 맞춘다.
function kstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 요청이 게스트 체험 요청인지 판별한다. 유효한 x-guest-id 헤더가 있고, 동시에
 * 유효한 로그인 세션이 **없을 때만** guest id 를 돌려준다.
 *
 * 후자의 조건이 핵심이다 — 이게 없으면 무료 플랜 사용자가 x-guest-id 헤더를 끼워 넣어
 * 본인 계정의 일일 한도(평론 1편) 대신 게스트 한도를 타고 우회할 수 있다.
 */
export async function guestIdFrom(req: Request): Promise<string | null> {
  const id = req.headers.get("x-guest-id");
  if (!id || !UUID_RE.test(id)) return null;

  // anon key 도 형식상 JWT라 항상 Authorization 에 실려 온다 — getUser 가 유저를
  // 돌려주는 경우(=실제 로그인 세션)만 게스트가 아니다.
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (jwt) {
    try {
      const { data } = await adminClient().auth.getUser(jwt);
      if (data?.user) return null;
    } catch {
      // 토큰 검증 실패 = 로그인 세션 아님 → 게스트로 진행
    }
  }
  return id;
}

const MESSAGES = {
  device: {
    ko: "체험은 하루 한 번까지 이용할 수 있어요. 로그인하면 계속 이어갈 수 있습니다.",
    en: "The guest trial is limited to once a day. Sign in to keep going.",
  },
  global: {
    ko: "지금은 체험 이용이 많아 잠시 마감되었어요. 로그인하면 바로 이용할 수 있습니다.",
    en: "The guest trial is temporarily full. Sign in to continue right away.",
  },
  failed: {
    ko: "사용량 확인에 실패했습니다.",
    en: "Failed to verify usage.",
  },
};

function errorResponse(
  status: number,
  error: string,
  message: string,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * 게스트 1회 사용을 소비한다. 상한 초과 시 429 응답을 돌려준다.
 * 호출부는 이 함수를 "로그인 사용자 게이트가 실패했고 guest id 가 있을 때"만 탄다.
 */
export async function consumeGuestUsage(
  guestId: string,
  action: GuestAction,
  cors: Record<string, string>,
  language?: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const lang = language === "en" ? "en" : "ko";

  const { data, error } = await adminClient().rpc("consume_guest_usage", {
    p_guest_id: guestId,
    p_action: action,
    p_day: kstDay(),
    p_limit: GUEST_DEVICE_LIMITS[action],
    p_global_limit: GUEST_GLOBAL_LIMITS[action],
  });

  if (error) {
    console.error("consume_guest_usage rpc failed:", error);
    return {
      ok: false,
      response: errorResponse(500, "usage_check_failed", MESSAGES.failed[lang], cors),
    };
  }

  const result = data as { allowed: boolean; reason?: string | null };
  if (!result.allowed) {
    const reason = result.reason === "global" ? "global" : "device";
    return {
      ok: false,
      // guest_limit_exceeded: 클라이언트가 로그인 유도 모달로 분기하는 신호
      response: errorResponse(429, "guest_limit_exceeded", MESSAGES[reason][lang], cors),
    };
  }

  return { ok: true };
}
