import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { DAY, allow, clientIp, tooMany } from "@/lib/rateLimit";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { assertPublicUrl, evidenceIn, readRobots, readSite } from "@/lib/siteReader";

export const runtime = "nodejs";
export const maxDuration = 120;

const FIELDS = ["description", "location", "phone", "features", "instructors", "subjects", "courses", "sns"] as const;
const Body = z.object({ url: z.string().trim().min(4).max(300), consent: z.literal(true) });
const Out = z.object({
  items: z.array(
    z.object({
      field: z.enum(FIELDS),
      value: z.string().min(1).max(300),
      evidence: z.string().min(2).max(200), // 페이지 원문에서 그대로 옮긴 근거
      url: z.string().max(500),
    }),
  ).max(40),
});

/**
 * 학원 공식 홈페이지에서 공개된 정보만 추출한다.
 * - 사용자 동의(consent=true) 필수, robots.txt 준수, 로그인·접근 제한 우회 없음
 * - 근거 문장이 실제 페이지 원문에 없으면 버린다(AI 추측 차단)
 */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  if (!(await allow(`analyze-site:${clientIp(req)}`, 30, DAY))) return tooMany("오늘 분석 사용 한도를 넘었습니다. 내일 다시 이용해 주세요.");
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "홈페이지 주소와 수집 동의를 확인해 주세요." }, { status: 400 });

  let start: URL;
  try {
    start = await assertPublicUrl(/^https?:\/\//.test(p.data.url) ? p.data.url : `https://${p.data.url}`);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "주소를 확인해 주세요." }, { status: 400 });
  }

  const checkedAt = Date.now();
  const robots = await readRobots(start);
  if (robots.status === "error")
    return Response.json({ checkedAt, robots: robots.status, pages: [], items: [], error: "robots.txt 를 확인할 수 없어 수집하지 않았습니다." });

  const pages = await readSite(start, robots);
  const okPages = pages.filter((x) => x.ok && x.text);
  const meta = { checkedAt, robots: robots.status, pages: pages.map(({ url, ok, reason }) => ({ url, ok, reason })) };
  if (!okPages.length) return Response.json({ ...meta, items: [] });
  if (IS_MOCK) return Response.json({ ...meta, items: [], error: "샘플 모드에서는 AI 추출을 하지 않습니다." });

  try {
    const out = await generateJson({
      system: "당신은 웹페이지에서 학원 정보를 있는 그대로 옮겨 적는 추출기입니다. 추측·요약·보완을 하지 않습니다.",
      user: `아래는 학원 공식 홈페이지의 공개 페이지 텍스트입니다. 다음 항목을 찾으세요.
항목: description(학원 소개), location(주소), phone(대표 전화), features(학원 특징, 여러 개), instructors(강사 이름과 담당 과목, 여러 개), subjects(가르치는 과목), courses(교육 과정·반 이름), sns(공식 SNS 주소)

[규칙]
- 페이지에 실제로 적힌 내용만. 없으면 그 항목은 아예 넣지 않는다. 추측·일반론·보완 금지.
- evidence 에는 그 값의 근거가 되는 원문을 한 글자도 바꾸지 말고 그대로 옮긴다(200자 이내).
- url 에는 근거가 있는 페이지 주소를 넣는다.
- 합격 실적·순위·수강료 같은 수치는 넣지 않는다.

${okPages.map((x) => `<page url="${x.url}">\n${x.text}\n</page>`).join("\n")}

JSON 형식: {"items": [{"field": "location", "value": "...", "evidence": "...", "url": "..."}]}`,
      schema: Out,
      mock: () => ({ items: [] }),
      maxTokens: 4000,
    });
    // 근거가 원문에 없는 값은 버린다
    const byUrl = new Map(okPages.map((x) => [x.url, x.text]));
    const all = okPages.map((x) => x.text).join("\n");
    const items = out.items.filter((it) => evidenceIn(it.evidence, byUrl.get(it.url) ?? all));
    return Response.json({ ...meta, items, dropped: out.items.length - items.length });
  } catch (e) {
    console.error("[analyze-site]", e);
    return Response.json({ ...meta, items: [], error: toUserMessage(e) }, { status: 502 });
  }
}
