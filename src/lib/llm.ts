import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

// 서버 전용. API 키는 환경변수로만 읽고 클라이언트로 내보내지 않는다.
const API_KEY = process.env.ANTHROPIC_API_KEY;
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const IS_MOCK = !API_KEY || process.env.LLM_MODE === "mock";
export type Effort = "low" | "medium" | "high";
// 문체 다듬기·문구 만들기처럼 가벼운 단계용(출력 단가가 Sonnet의 1/20)
export const LIGHT_MODEL = process.env.ANTHROPIC_LIGHT_MODEL || "claude-haiku-5-5";
// 기획·본문·이미지 문구는 같은 시스템 프롬프트를 캐시로 나눠 쓴다. effort가 다르면 캐시가 깨질 수 있어 한 값으로 맞춘다.
export const MAIN_EFFORT: Effort = (process.env.LLM_EFFORT as Effort) || "medium";

const client = IS_MOCK ? null : new Anthropic({ apiKey: API_KEY });

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Claude에 JSON 응답을 요청하고 zod 스키마로 검증한다.
 * 스키마 불일치 시 오류 내용을 알려주고 1회 재시도한다.
 * MOCK 모드에서는 mockFn 결과를 반환한다(실제 생성물 아님).
 */
export async function generateJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  mock: () => T;
  maxTokens?: number;
  tools?: Anthropic.ToolUnion[];
  effort?: Effort;
  model?: string;
  // 기본은 끔. 구조화 출력은 단계마다 스키마가 달라 접두부가 달라지므로, 실측(2026-11 로그)에서 cache_read가 항상 0이고 쓰기 비용(1.25배)만 들었다
  cache?: boolean;
}): Promise<T> {
  if (IS_MOCK || !client) return opts.schema.parse(opts.mock());
  // Claude Sonnet 5.5 는 사고(thinking)가 항상 켜져 있고 그 토큰도 max_tokens 에 포함된다.
  // 한도가 낮으면 JSON이 중간에 잘리므로 넉넉히 잡는다(실제 과금은 사용량 기준).
  const maxTokens = Math.max(opts.maxTokens ?? 0, 16000);
  const model = opts.model ?? MODEL;
  const effort = opts.effort ?? MAIN_EFFORT;
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opts.system, ...(opts.cache && { cache_control: { type: "ephemeral" as const } }) },
  ];
  const logUsage = (u: Anthropic.Usage) =>
    console.info(
      `[llm:usage] effort=${effort} in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens}`,
    );

  // 1) 구조화 출력: API가 스키마에 맞는 JSON만 내도록 강제한다(문법이 깨진 JSON 방지).
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: opts.user }],
      ...(opts.tools && { tools: opts.tools }),
      output_config: { format: zodOutputFormat(opts.schema as z.ZodType<T>), effort },
    });
    logUsage(res.usage);
    if (res.stop_reason === "refusal") throw new Error("모델이 요청을 거절했습니다.");
    if (res.stop_reason === "max_tokens") throw new Error("응답이 길이 한도에서 잘렸습니다.");
    if (res.parsed_output != null) return opts.schema.parse(res.parsed_output);
  } catch (e) {
    // 인증·한도·서버 오류는 그대로 올린다. 스키마 미지원(400)이나 검증 실패만 아래 방식으로 대체한다.
    if (e instanceof Anthropic.APIError && e.status !== 400) throw e;
    console.warn("[llm] 구조화 출력 실패, 텍스트 JSON 방식으로 재시도:", String(e).slice(0, 200));
  }

  // 2) 대체: 텍스트로 JSON을 받아 검증하고, 실패하면 오류를 알려 1회 재시도한다.
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(opts.tools && { tools: opts.tools }),
      output_config: { effort },
    });
    logUsage(res.usage);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return opts.schema.parse(extractJson(text));
    } catch (e) {
      lastErr = e;
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: `응답이 요구한 JSON 스키마와 맞지 않습니다. 오류: ${String(e).slice(0, 800)}\nJSON 객체만 다시 출력하세요.`,
      });
    }
  }
  throw new Error(`JSON 파싱/검증 실패: ${String(lastErr).slice(0, 300)}`);
}

/** 개발자용 오류를 사용자가 이해할 수 있는 안내 문구로 변환한다. */
export function toUserMessage(e: unknown): string {
  const status = typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 401 || status === 403) return "API 키가 올바르지 않거나 권한이 없습니다. .env.local의 ANTHROPIC_API_KEY를 확인한 뒤 서버를 다시 시작해 주세요.";
  if (status === 404) return "설정된 모델을 사용할 수 없습니다. ANTHROPIC_MODEL 값을 확인해 주세요.";
  if (status === 429) return "요청이 몰려 잠시 제한되었습니다. 1~2분 뒤 다시 시도해 주세요.";
  if (status === 402 || /credit|billing/i.test(msg)) return "API 크레딧이 부족합니다. Anthropic 콘솔의 결제 상태를 확인해 주세요.";
  if (status >= 500 || status === 529) return "AI 서버가 일시적으로 응답하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  if (/JSON/.test(msg)) return "AI 응답을 해석하지 못했습니다. 같은 단계부터 다시 시도해 주세요.";
  if (/fetch failed|ENOTFOUND|ECONN|timeout|Connection/i.test(msg)) return "AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  return "생성 중 문제가 발생했습니다. 이미 완료된 단계는 보존되어 있으니 다시 시도해 주세요.";
}

/** 서버 상태를 가볍게 점검한다(키 유효성 확인용, 토큰 최소 사용). */
export async function pingApi(): Promise<{ ok: boolean; message?: string }> {
  if (IS_MOCK || !client) return { ok: false, message: "API 키가 설정되지 않았습니다." };
  try {
    await client.messages.create({ model: MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: toUserMessage(e) };
  }
}
