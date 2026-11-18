import { z } from "zod";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { ImageCopySchema, fallbackCopy, type ImageTarget } from "@/lib/imageCopy";
import { systemPrompt } from "@/lib/prompts";
import { DraftSchema } from "@/lib/schemas";
import { getCtx } from "@/lib/requestCtx";

export const runtime = "nodejs";
export const maxDuration = 120;

const TargetSchema = z.object({ kind: z.enum(["thumbnail", "section"]), sectionIndex: z.number().int().min(0).nullable() });
const Body = z.object({
  topic: z.string().max(200),
  contentType: z.string().max(40),
  draft: DraftSchema,
  brand: z.unknown().optional(),
  tenant: z.unknown().optional(),
  targets: z.array(TargetSchema).min(1).max(8).optional(),
});

/** 썸네일 + 소주제별 이미지에 들어갈 문구를 만든다. 글자는 이후 코드로 렌더링한다. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "이미지 요청 형식을 확인해 주세요." }, { status: 400 });
  const { draft, topic, contentType } = p.data;
  const got = await getCtx(p.data);
  if (!got.ok) return got.res;
  const { ctx } = got;
  const targets: ImageTarget[] = p.data.targets ?? [
    { kind: "thumbnail", sectionIndex: null },
    ...draft.sections.map((_, i) => ({ kind: "section" as const, sectionIndex: i })),
  ];
  const valid = targets.filter((t) => t.kind === "thumbnail" || (t.sectionIndex != null && t.sectionIndex < draft.sections.length));

  const OutSchema = z.object({ items: z.array(ImageCopySchema).length(valid.length) });
  const mock = () => ({ items: valid.map((t) => fallbackCopy(draft, t, contentType)) });

  try {
    const out = await generateJson({
      system: systemPrompt(ctx),
      user: `블로그 글에 넣을 1:1 정사각형 이미지 ${valid.length}장의 문구를 만드세요. 글자는 디자이너가 그대로 얹습니다.

주제: ${topic}
콘텐츠 유형: ${contentType}
본문: ${JSON.stringify(draft)}

만들 이미지(순서대로):
${valid.map((t, i) => `${i + 1}. ${t.kind === "thumbnail" ? "썸네일(글 전체 대표)" : `소주제 ${t.sectionIndex! + 1} "${draft.sections[t.sectionIndex!].heading}"`}`).join("\n")}

[규칙]
- 본문에 있는 내용만 쓴다. 본문에 없는 숫자·날짜·학년도·대학명·혜택·합격 표현을 만들지 않는다.
- title: 1~3줄, 한 줄 4~9자. 썸네일은 검색 키워드가 보이게, 소주제는 그 소주제의 핵심 행동.
- highlight: 가장 강조할 title 줄 번호(0부터), 없으면 -1.
- eyebrow: 8자 이내. 썸네일은 과목·분야(예: 중등 영어, 수학 내신), 소주제는 "POINT 01"처럼 번호.
- sub: 18자 이내 한 줄 요약. 필요 없으면 "".
- points: 체크 항목 0~3개, 각 10자 이내. 본문의 bullets·소제목에서 가져온다.
- scene: 글자 없는 일러스트 설명(영어 2~3문장). 그 이미지가 다루는 내용이 한눈에 보이는 구체적인 장면으로 쓴다.
  이미지마다 장면·사물·구도·시점을 서로 다르게 한다(예: 책상 위 클로즈업 / 칠판 앞 설명 / 노트 필기하는 손 / 시계와 계획표 / 두 학생이 함께 공부).
  같은 인물·같은 책상 장면을 반복하지 않는다. 실제 인물·로고·대학 건물·실제 학원 내부·읽을 수 있는 글자 금지.

JSON 형식: {"items": [{"eyebrow": "", "title": [""], "highlight": 0, "sub": "", "points": [""], "scene": ""}]}
반드시 설명 없이 JSON 객체 하나만 출력하세요.`,
      schema: OutSchema,
      mock,
      maxTokens: 2500,
    });
    return Response.json({
      mock: IS_MOCK,
      items: valid.map((t, i) => ({ ...t, copy: out.items[i] })),
    });
  } catch (e) {
    console.error("[images/copy]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
