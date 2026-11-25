import { z } from "zod";
import { IS_MOCK, generateJson, toUserMessage } from "@/lib/llm";
import { ImageCopySchema, fallbackCopy, type ImageTarget } from "@/lib/imageCopy";
import { systemPrompt } from "@/lib/prompts";
import { DraftSchema } from "@/lib/schemas";
import { getCtx } from "@/lib/requestCtx";
import { DAY, allow, tooMany } from "@/lib/rateLimit";
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
  // 글 생성 직후 자동으로 만들 때: 소주제 이미지를 글 성격에 맞게 골라 썸네일 포함 2~5장만 만든다
  auto: z.boolean().optional(),
});
const MAX_SECTION_IMAGES = 4; // 썸네일 포함 최대 5장

/** 썸네일 + 소주제별 이미지에 들어갈 문구를 만든다. 글자는 이후 코드로 렌더링한다. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "이미지 요청 형식을 확인해 주세요." }, { status: 400 });
  const { draft, topic, contentType } = p.data;
  const got = await getCtx(p.data);
  if (!got.ok) return got.res;
  if (got.session && !(await allow(`image-copy:${got.session.user.id}`, 100, DAY)))
    return tooMany("오늘 이미지 문구 만들기 사용 한도(100회)를 넘었습니다. 내일 다시 이용해 주세요.");
  const { ctx } = got;
  const targets: ImageTarget[] = p.data.targets ?? [
    { kind: "thumbnail", sectionIndex: null },
    ...draft.sections.map((_, i) => ({ kind: "section" as const, sectionIndex: i })),
  ];
  const valid = targets.filter((t) => t.kind === "thumbnail" || (t.sectionIndex != null && t.sectionIndex < draft.sections.length));

  const auto = !!p.data.auto;
  const ItemSchema = ImageCopySchema.extend({ use: z.boolean() });
  const OutSchema = z.object({ items: z.array(ItemSchema).length(valid.length) });
  let sectionSeen = 0;
  const mock = () => ({
    items: valid.map((t) => ({ ...fallbackCopy(draft, t, contentType), use: t.kind === "thumbnail" || ++sectionSeen <= 2 })),
  });
  /** auto면 썸네일 + 고른 소주제(1~4장)만 남긴다. 하나도 안 골랐으면 첫 소주제를 넣는다. */
  const pick = (items: z.infer<typeof ItemSchema>[]) => {
    const rows = valid.map((t, i) => ({ t, item: items[i] }));
    if (!auto) return rows;
    const sections = rows.filter((r) => r.t.kind === "section");
    const chosen = sections.filter((r) => r.item.use).slice(0, MAX_SECTION_IMAGES);
    const keep = new Set((chosen.length ? chosen : sections.slice(0, 1)).map((r) => r.t.sectionIndex));
    return rows.filter((r) => r.t.kind === "thumbnail" || keep.has(r.t.sectionIndex));
  };

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
  · 질문형("왜 ~까?", "~할까?")은 이미지 전체에서 1장만. 나머지는 단정·명사형으로 끝을 다르게 한다(예: "감점 자리는 4곳", "오답 노트는 이유부터").
  · 문장으로 끝나는 title·sub는 짧은 명사형이나 "~하세요" 꼴로 쓴다(예: "기한 세 개를 표시하세요").
  · 사람이 손으로 만든 카드뉴스처럼 구체적으로. "핵심 정리", "꿀팁", "총정리" 같은 뻔한 말은 쓰지 않는다.
- highlight: 가장 강조할 title 줄 번호(0부터, 보통 핵심 키워드 줄), 없으면 -1.
- eyebrow: 8자 이내. 썸네일은 과목·분야(예: 중등 영어), 소주제는 "POINT 01"처럼 번호.
- sub: 16자 이내. 썸네일은 글이 다루는 범위를 짧게(예: "숙소부터 자습·상담까지"), 소주제는 핵심 한 줄. 필요 없으면 "".
- points: 체크 항목 0~3개, 각 10자 이내. 본문의 bullets·소제목에서 가져온다.
- use: ${auto ? `썸네일은 항상 true. 소주제 이미지는 글 성격에 맞게 1~${MAX_SECTION_IMAGES}장만 true로 고른다. 이미지가 있으면 이해가 빨라지는 소주제(단계·비교·체크리스트·핵심 장면)를 우선하고, 설명만으로 충분한 소주제는 false. 짧은 글이면 1~2장이면 된다.` : "항상 true."}
- visual: "scene"(사진 위에 제목) 또는 "card"(내용 정리 카드).
  · 썸네일은 항상 "scene".
  · 소주제는 기본 "scene". 단계·비교·체크리스트처럼 표로 정리해야 읽히는 소주제 1곳만 "card"로 할 수 있다.
- items: 소주제 이미지마다 그 소주제의 "내용 정리" 3~4개(label 12자 이내 + detail 24자 이내). 본문에 없는 내용은 쓰지 않는다. 썸네일은 [].
- scene: 사진 생성용 장면 설명(영어 2~3문장). 실제 촬영한 사진처럼 구체적으로 쓴다.
  · 누가(예: a Korean student in her early twenties in a navy sweatshirt), 어디서(독서실 책상, 상담실, 기숙사 방, 강의실 뒷자리 등), 무엇을 하는지, 손에 든 물건, 빛(밝은 낮 창가 빛 위주. 어둡거나 밤 장면은 피한다), 카메라 시점(eye-level medium shot, over-the-shoulder, close-up of hands)을 쓴다.
  · 그 이미지가 다루는 내용이 사진만 봐도 느껴지게 한다(예: 학습관리 → 플래너에 체크하는 손과 주간 계획표, 상담 → 강사와 학생이 마주 앉아 노트를 보는 장면).
  · 이미지마다 장소·인물·시점·소품을 모두 다르게 한다. 같은 인물·같은 책상 구도를 반복하지 않는다.
  · 실존 인물·로고·대학 건물·실제 학원 내부·읽을 수 있는 글자 금지.
  · AI 사진 티를 피한다: 카메라를 보고 웃는 정면 얼굴, 엄지 척, 완벽하게 정돈된 책상 대신 손·옆모습·뒷모습·소품 위주로, 사람이 실제로 쓰던 흔적(접힌 페이지, 포스트잇, 반쯤 마신 음료)이 보이는 순간을 쓴다.

JSON 형식: {"items": [{"use": true, "eyebrow": "", "title": [""], "highlight": 0, "sub": "", "points": [""], "visual": "card", "items": [{"label": "", "detail": ""}], "scene": ""}]}
반드시 설명 없이 JSON 객체 하나만 출력하세요.`,
      schema: OutSchema,
      mock,
      maxTokens: 4000,
    });
    const rows = pick(out.items);
    if (got.session?.tenantId && !IS_MOCK)
      await logEvent(got.session.tenantId, got.session.user.id, "image_generation_completed", { kind: "card", count: rows.length });
    return Response.json({
      mock: IS_MOCK,
      items: rows.map(({ t, item: { use: _use, ...copy } }) => ({ ...t, copy })), // eslint-disable-line @typescript-eslint/no-unused-vars
    });
  } catch (e) {
    console.error("[images/copy]", e);
    return Response.json({ error: toUserMessage(e) }, { status: 502 });
  }
}
