import { z } from "zod";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { ImageCopySchema, fallbackCopy, type ImageTarget } from "@/lib/imageCopy";
import { systemPrompt } from "@/lib/prompts";
import { DraftSchema } from "@/lib/schemas";
import { getCtx } from "@/lib/requestCtx";
import { logEvent } from "@/lib/usage";

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
- title: 1~3줄, 한 줄 4~8자. 블로그 목록에서 눈에 꽂히는 포스터 헤드라인처럼 쓴다.
  · 썸네일: 검색 키워드가 그대로 보이게 + 궁금증을 거는 마무리. 예) ["공무원 기숙학원", "학습관리는 어떻게?"], ["편입영어", "빈칸 추론", "정답 가르는 법"], ["A학원 B학원", "비교분석"]
  · 소주제: 그 소주제의 핵심을 명사형·질문형으로 짧게. "~하는 방법", "~에 대해" 같은 밋밋한 꼬리는 쓰지 않는다.
- highlight: 가장 강조할 title 줄 번호(0부터, 보통 핵심 키워드 줄), 없으면 -1.
- eyebrow: 8자 이내. 썸네일은 과목·분야(예: 중등 영어), 소주제는 "POINT 01"처럼 번호.
- sub: 16자 이내. 썸네일은 글이 다루는 범위를 짧게(예: "숙소부터 자습·상담까지"), 소주제는 핵심 한 줄. 필요 없으면 "".
- points: 체크 항목 0~3개, 각 10자 이내. 본문의 bullets·소제목에서 가져온다.
- visual: "scene"(사진 위에 제목) 또는 "card"(내용 정리 카드).
  · 썸네일은 항상 "scene".
  · 소주제는 기본 "scene". 단계·비교·체크리스트처럼 표로 정리해야 읽히는 소주제 1곳만 "card"로 할 수 있다.
- items: 소주제 이미지마다 그 소주제의 "내용 정리" 3~4개(label 12자 이내 + detail 24자 이내). 본문에 없는 내용은 쓰지 않는다. 썸네일은 [].
- scene: 사진 생성용 장면 설명(영어 2~3문장). 실제 촬영한 사진처럼 구체적으로 쓴다.
  · 누가(예: a Korean student in her early twenties in a navy sweatshirt), 어디서(독서실 책상, 상담실, 기숙사 방, 강의실 뒷자리 등), 무엇을 하는지, 손에 든 물건, 빛(아침 창가 빛, 따뜻한 스탠드 조명), 카메라 시점(eye-level medium shot, over-the-shoulder, close-up of hands)을 쓴다.
  · 그 이미지가 다루는 내용이 사진만 봐도 느껴지게 한다(예: 학습관리 → 플래너에 체크하는 손과 주간 계획표, 상담 → 강사와 학생이 마주 앉아 노트를 보는 장면).
  · 이미지마다 장소·인물·시점·소품을 모두 다르게 한다. 같은 인물·같은 책상 구도를 반복하지 않는다.
  · 실존 인물·로고·대학 건물·실제 학원 내부·읽을 수 있는 글자 금지.

JSON 형식: {"items": [{"eyebrow": "", "title": [""], "highlight": 0, "sub": "", "points": [""], "visual": "card", "items": [{"label": "", "detail": ""}], "scene": ""}]}
반드시 설명 없이 JSON 객체 하나만 출력하세요.`,
      schema: OutSchema,
      mock,
      maxTokens: 4000,
    });
    if (got.session?.tenantId && !IS_MOCK)
      await logEvent(got.session.tenantId, got.session.user.id, "image_generation_completed", { kind: "card", count: valid.length });
    return Response.json({
      mock: IS_MOCK,
      items: valid.map((t, i) => ({ ...t, copy: out.items[i] })),
    });
  } catch (e) {
    console.error("[images/copy]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
