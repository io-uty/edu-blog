import { z } from "zod";
import { BANNED_PHRASES } from "@/config/rules";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { HUMANIZE_RULES } from "@/lib/humanize";
import { systemPrompt } from "@/lib/prompts";
import { getCtx } from "@/lib/requestCtx";
import { DAY, allow, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACTIONS = {
  polish: `사람이 쓴 글처럼 자연스럽게 다듬으세요. 의미·분량·존댓말 등급은 유지합니다.\n${HUMANIZE_RULES}`,
  shorten: "핵심만 남기고 길이를 약 30~40% 줄이세요.",
  expand: "필요한 설명을 보태 길이를 약 30~50% 늘리세요. 새로운 사실·수치는 추가하지 마세요.",
  simplify: "수험생이 바로 이해할 수 있는 쉬운 표현으로 바꾸세요.",
  professional: "학습 컨설턴트다운 전문적이고 신중한 표현으로 바꾸세요.",
} as const;

const Body = z.object({
  action: z.enum(["polish", "shorten", "expand", "simplify", "professional"]),
  text: z.string().trim().min(2).max(3000),
  brand: z.unknown().optional(),
  tenant: z.unknown().optional(),
});
const Out = z.object({ text: z.string().min(1) });

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "선택한 문장을 확인해 주세요." }, { status: 400 });
  const { action, text } = p.data;
  const got = await getCtx(p.data);
  if (!got.ok) return got.res;
  if (got.session && !(await allow(`refine:${got.session.user.id}`, 150, DAY)))
    return tooMany("오늘 문장 다듬기 사용 한도(150회)를 넘었습니다. 내일 다시 이용해 주세요.");
  const { ctx } = got;
  if (IS_MOCK) return Response.json({ mock: true, text });
  try {
    const out = await generateJson({
      system: systemPrompt(ctx),
      user: `아래 선택 영역만 수정합니다.\n지시: ${ACTIONS[action]}\n규칙: 원문에 없는 사실·수치·일정·혜택을 만들지 않는다. 금지 표현(${[...BANNED_PHRASES, ...ctx.tenant.prohibited].join(", ")}) 사용 금지. 줄바꿈 구조는 유지한다.\n\n원문:\n${text}\n\nJSON으로만 답하세요: {"text": "수정된 문장"}`,
      schema: Out,
      mock: () => ({ text }),
      maxTokens: 1500,
    });
    return Response.json({ mock: false, text: out.text });
  } catch (e) {
    console.error("[refine]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
