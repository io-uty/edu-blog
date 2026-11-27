import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { DAY, allow, clientIp, tooMany } from "@/lib/rateLimit";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { StyleProfileSchema } from "@/lib/tenant";
import { assertPublicUrl, isNaverBlog, readPage, readRobots } from "@/lib/siteReader";

export const runtime = "nodejs";
export const maxDuration = 120;

const Sample = z.object({ name: z.string().max(120), text: z.string().trim().min(200).max(15000) });
const Body = z.object({
  samples: z.array(Sample).max(3).default([]),
  urls: z.array(z.string().trim().max(500)).max(3).default([]), // 블로그 글 주소만 붙여 넣은 경우 서버가 읽는다
});

/** 글 주소를 읽어 샘플로 만든다. 못 읽으면 사용자에게 보여 줄 이유를 돌려준다. */
async function readPost(raw: string): Promise<z.infer<typeof Sample> | string> {
  let u: URL;
  try {
    u = await assertPublicUrl(raw);
  } catch (e) {
    return `${raw}: ${e instanceof Error ? e.message : "주소를 확인해 주세요."}`;
  }
  if (isNaverBlog(u)) return "네이버 블로그는 AI 분석 목적의 자동 읽기를 금지하고 있어 주소로 읽을 수 없습니다. 글 내용을 복사해 붙여 넣어 주세요.";
  const { page } = await readPage(u, await readRobots(new URL(u.origin)), { mainOnly: true });
  if (!page.ok) return `${u.hostname}: ${page.reason}`;
  if (page.text.length < 200) return `${u.hostname}: 본문을 찾지 못했습니다(200자 미만).`;
  return { name: u.href.slice(0, 120), text: page.text };
}

/** 학원이 올린 기존 블로그 글에서 문체·구성 습관을 뽑는다(내용·사실은 가져오지 않음). */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  if (!(await allow(`analyze-style:${clientIp(req)}`, 30, DAY))) return tooMany("오늘 분석 사용 한도를 넘었습니다. 내일 다시 이용해 주세요.");
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "글을 1~3개, 각각 200자 이상 올려 주세요." }, { status: 400 });
  const read = await Promise.all(p.data.urls.map(readPost));
  const failed = read.filter((r): r is string => typeof r === "string");
  const samples = [...p.data.samples, ...read.filter((r): r is z.infer<typeof Sample> => typeof r !== "string")].slice(0, 3);
  if (!samples.length) return Response.json({ error: failed[0] ?? "글을 1~3개, 각각 200자 이상 올려 주세요." }, { status: 400 });
  const excerpts = samples.slice(0, 2).map((s) => s.text.slice(0, 2500));
  if (IS_MOCK) return Response.json({ mock: true, profile: null, excerpts, read: samples.map((x) => x.name), failed });
  try {
    const profile = await generateJson({
      system: "당신은 블로그 글의 문체와 구성을 분석하는 편집자입니다. 글의 사실·숫자·주장은 옮기지 않고 쓰는 방식만 정리합니다.",
      user: `아래 학원 블로그 글들의 공통된 쓰는 방식을 정리하세요.

${samples.map((s, i) => `<post_${i + 1} name="${s.name.replace(/"/g, "")}">\n${s.text}\n</post_${i + 1}>`).join("\n")}

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
    return Response.json({ profile, excerpts, read: samples.map((x) => x.name), failed });
  } catch (e) {
    console.error("[analyze-style]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
