import { supabase } from "./supabase";
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

async function invokeFunction<TReq, TRes>(
  functionName: string,
  body: TReq,
  timeoutMs: number
): Promise<TRes> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: body as Record<string, unknown>,
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error((data as LLMErrorResponse).message);

    return data as TRes;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyContent(
  request: VerifyContentRequest
): Promise<VerifyContentResponse> {
  return invokeFunction<VerifyContentRequest, VerifyContentResponse>(
    "verify-content",
    request,
    10_000
  );
}

export async function generateQuestion(
  request: GenerateQuestionRequest
): Promise<GenerateQuestionResponse> {
  return invokeFunction<GenerateQuestionRequest, GenerateQuestionResponse>(
    "generate-question",
    request,
    15_000
  );
}

export async function generateReview(
  request: GenerateReviewRequest
): Promise<GenerateReviewResponse> {
  return invokeFunction<GenerateReviewRequest, GenerateReviewResponse>(
    "generate-review",
    request,
    30_000
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
    20_000
  );
}
