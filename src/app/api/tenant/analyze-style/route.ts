import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { StyleProfileSchema } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  samples: z.array(z.object({ name: z.string().max(120), text: z.string().trim().min(200).max(15000) })).min(1).max(3),
});

/** 학원이 올린 기존 블로그 글에서 문체·구성 습관을 뽑는다(내용·사실은 가져오지 않음). */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "글을 1~3개, 각각 200자 이상 올려 주세요." }, { status: 400 });
  const excerpts = p.data.samples.slice(0, 2).map((s) => s.text.slice(0, 2500));
  if (IS_MOCK) return Response.json({ mock: true, profile: null, excerpts });
  try {
    const profile = await generateJson({
      system: "당신은 블로그 글의 문체와 구성을 분석하는 편집자입니다. 글의 사실·숫자·주장은 옮기지 않고 쓰는 방식만 정리합니다.",
      user: `아래 학원 블로그 글들의 공통된 쓰는 방식을 정리하세요.

${p.data.samples.map((s, i) => `<post_${i + 1} name="${s.name.replace(/"/g, "")}">\n${s.text}\n</post_${i + 1}>`).join("\n")}

- tone: 전체 말투(존댓말 수준, 친근함/전문성)
- sentenceEndings: 자주 쓰는 종결 표현 3~6개(예: "~해 보세요")
- introPattern: 도입부를 시작하는 방식
- headingStyle: 소제목 쓰는 방식(길이, 문장형/명사형, 기호)
- structure: 소주제 수, 목록·표·예시 사용 습관
- closingPattern: 마무리 방식
- formatting: 강조, 이모지, 줄바꿈 습관
- avoid: 이 글들에서 쓰지 않거나 피하는 것 0~6개
JSON으로만 답하세요.`,
      schema: StyleProfileSchema,
      mock: () => ({ tone: "", sentenceEndings: [], introPattern: "", headingStyle: "", structure: "", closingPattern: "", formatting: "", avoid: [] }),
      maxTokens: 3000,
    });
    return Response.json({ profile, excerpts });
  } catch (e) {
    console.error("[analyze-style]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
