// JSON 모드 LLM 호출 공통 모듈 — DeepSeek(deepseek-chat) 단독.
// 딥시크 JSON 모드 제약: 프롬프트에 "json"이라는 단어와 출력 예시가 반드시 포함되어야
// 하며, 간헐적으로 빈 content를 반환할 수 있다 → 빈 응답일 때만 1회 재시도.
// 웹서치가 필요한 verify-content/recommend-content는 OpenAI 호스티드 web_search에
// 의존하므로 이 모듈을 쓰지 않는다 (딥시크는 내장 웹서치 도구가 없음).

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

export interface JsonLLMOptions {
  temperature?: number;
  maxTokens?: number;
  // 시도당 타임아웃. 빈 응답 재시도는 드물고 빠르게 끝나므로
  // 사실상 이 값이 전체 소요 시간의 상한이다.
  timeoutMs?: number;
}

class EmptyContentError extends Error {}

async function callChatJson(
  prompt: string,
  { temperature = 0.7, maxTokens = 1024, timeoutMs = 15_000 }: JsonLLMOptions,
): Promise<unknown> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `LLM HTTP ${res.status} (${DEEPSEEK_MODEL})`);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new EmptyContentError(`LLM empty content (${DEEPSEEK_MODEL})`);
  }
  return JSON.parse(content);
}

export async function callJsonLLM(prompt: string, options: JsonLLMOptions = {}): Promise<unknown> {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 미설정");
  try {
    return await callChatJson(prompt, options);
  } catch (e) {
    if (!(e instanceof EmptyContentError)) throw e;
    console.error("callJsonLLM: 빈 응답 — 1회 재시도:", e);
    return await callChatJson(prompt, options);
  }
}
