import { supabase } from "./supabase";
import { useGuestStore } from "../stores/guestStore";
import type {
  VerifyContentRequest,
  VerifyContentResponse,
  GenerateQuestionRequest,
  GenerateQuestionResponse,
  GenerateReviewRequest,
  GenerateReviewResponse,
  AnalyzeTasteRequest,
  AnalyzeTasteResponse,
  RecommendContentRequest,
  RecommendContentResponse,
  LLMErrorResponse,
} from "../types/llm";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("요청 시간이 초과되었습니다.")), ms)
    ),
  ]);
}

// 게스트(비로그인 체험)는 세션이 없어 JWT 로 식별되지 않는다. 기기 로컬 UUID 를 보내
// 서버가 게스트 사용량 상한을 걸 수 있게 한다(supabase/functions/_shared/guest.ts).
// 로그인 상태에서는 절대 보내지 않는다 — 서버가 게스트 헤더를 받으면 플랜 한도 대신
// 게스트 한도를 태우게 되므로(서버에서도 이중 방어하지만) 클라이언트도 정직하게 보낸다.
function guestHeaders(): Record<string, string> | undefined {
  const { isGuest, guestId } = useGuestStore.getState();
  return isGuest && guestId ? { "x-guest-id": guestId } : undefined;
}

async function invokeFunction<TReq, TRes>(
  functionName: string,
  body: TReq,
  timeoutMs: number,
  options?: { allowGuest?: boolean }
): Promise<TRes> {
  const headers = options?.allowGuest ? guestHeaders() : undefined;
  const { data, error } = await withTimeout(
    supabase.functions.invoke(functionName, {
      body: body as Record<string, unknown>,
      ...(headers ? { headers } : {}),
    }),
    timeoutMs
  );

  if (error) {
    // FunctionsHttpError carries the actual Response in .context — read it
    const ctx = (error as { context?: Response }).context;
    if (ctx?.json) {
      try {
        const errorBody = await ctx.json() as LLMErrorResponse;
        throw new Error(errorBody.message ?? error.message);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message);
  }

  if (data?.error) throw new Error((data as LLMErrorResponse).message);

  return data as TRes;
}

export async function verifyContent(
  request: VerifyContentRequest
): Promise<VerifyContentResponse> {
  return invokeFunction<VerifyContentRequest, VerifyContentResponse>(
    "verify-content",
    request,
    // 캐시 조회 + 웹서치(~13s) + 콜드스타트 여유. 캐시 히트 시엔 1~2초로 끝남.
    35_000,
    { allowGuest: true }
  );
}

export async function generateQuestion(
  request: GenerateQuestionRequest
): Promise<GenerateQuestionResponse> {
  return invokeFunction<GenerateQuestionRequest, GenerateQuestionResponse>(
    "generate-question",
    request,
    15_000,
    { allowGuest: true }
  );
}

export async function generateReview(
  request: GenerateReviewRequest
): Promise<GenerateReviewResponse> {
  return invokeFunction<GenerateReviewRequest, GenerateReviewResponse>(
    "generate-review",
    request,
    30_000,
    { allowGuest: true }
  );
}

export async function analyzeTaste(
  request: AnalyzeTasteRequest
): Promise<AnalyzeTasteResponse> {
  return invokeFunction<AnalyzeTasteRequest, AnalyzeTasteResponse>(
    "analyze-taste",
    request,
    30_000
  );
}

export async function recommendContent(
  request: RecommendContentRequest
): Promise<RecommendContentResponse> {
  return invokeFunction<RecommendContentRequest, RecommendContentResponse>(
    "recommend-content",
    request,
    // 2단계 검증 파이프라인(web_search ~13s + format + 캐시대조 + deepseek 순위) + 콜드스타트 여유.
    // verify-content(35s)와 동일 예산으로 정렬 — 서버가 끝나기 전에 클라가 먼저 포기하던 불일치 해소.
    35_000
  );
}
