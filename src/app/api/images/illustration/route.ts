import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { getSession, SUPABASE_ENABLED } from "@/lib/supabase/server";
import { consume, refund } from "@/lib/usage";
import { randomUUID } from "node:crypto";
import { IMAGE_STYLE } from "@/config/imageStyle";
import { ILLUSTRATION_STYLES, type IllustrationStyle } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 120;

// 글자 없는 일러스트만 생성한다(제목·로고·숫자는 브라우저에서 코드로 얹음).
// OPENAI_API_KEY 가 있을 때만 동작한다. 모델은 IMAGE_MODEL(기본 gpt-image-2).
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.IMAGE_MODEL || "gpt-image-2";
// 원가 때문에 기본은 medium. 고품질이 필요하면 IMAGE_QUALITY=high
const QUALITY = process.env.IMAGE_QUALITY || "medium";

const Body = z.object({
  scene: z.string().trim().min(3).max(600),
  style: z.enum(Object.keys(ILLUSTRATION_STYLES) as [IllustrationStyle, ...IllustrationStyle[]]).default("photo"),
  note: z.string().max(200).default(""),
  // side: 오른쪽에 그림, 왼쪽 위는 글자 자리 / poster: 전체를 채우는 장면, 위쪽은 제목 자리 / plain: 글자 없이 그대로
  composition: z.enum(["note", "card", "side", "scene", "poster", "plain"]).default("poster"),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(3).default([]),
});

export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  if (!KEY) return Response.json({ error: "일러스트 생성 API가 설정되지 않았습니다." }, { status: 501 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "일러스트 설명을 확인해 주세요." }, { status: 400 });

  // 이미지 생성 사용량(로그인 사용 시 서버에서 차감, 실패하면 되돌림)
  const session = SUPABASE_ENABLED ? await getSession() : null;
  const key = `img:${randomUUID()}`;
  if (session?.tenantId) {
    const r = await consume(session.tenantId, session.user.id, "image", key).catch(() => null);
    if (!r) return Response.json({ error: "사용량을 확인하지 못했습니다." }, { status: 500 });
    if (!r.allowed) return Response.json({ code: "QUOTA_EXCEEDED", error: "이미지 생성 횟수를 모두 사용했습니다. 생성권을 구매해 주세요." }, { status: 402 });
  }
  const undo = async () => {
    if (session?.tenantId) await refund(session.tenantId, session.user.id, "image", key);
  };

  const realistic = p.data.style === "photo";
  const composition = {
    note: "bright tidy study desk seen from slightly above, objects only around the edges of the frame (a potted plant, a stack of hardcover books with blank spines, a laptop corner, an open spiral notebook, a pen, a small flower); the center 60% of the frame is a clear, evenly lit empty desk surface because a paper sticky note will be placed there",
    card: "the main subject sits in the lower part of the frame: a person or character's head and eyes peeking up from behind a laptop or desk toward the viewer; plain soft single-color background with a few simple subject-related props as flat icons; nothing important in the upper third",
    poster:
      "full-bleed square composition. The main subject sits in the lower 55-60% of the frame; the upper 40% is calm, softly lit, out-of-focus background (wall, window light, bokeh) with no objects, so a large headline can be placed there",
    scene:
      "full-bleed square composition. The main subject sits in the lower 55-60% of the frame; the upper 40% is calm, softly lit, out-of-focus background with no objects, so a headline can be placed there",
    side: "main subject placed in the right half and lower part of the canvas; keep the upper-left area as a simple, uncluttered background for text overlay",
    plain: "balanced square composition with a clear focal point",
  }[p.data.composition];
  const prompt = [
    p.data.scene,
    ILLUSTRATION_STYLES[p.data.style].prompt,
    realistic
      ? "Korean setting and Korean people in their late teens to twenties, caught mid-action and not posing or smiling at the camera; prefer side views, over-the-shoulder views, hands and objects over front-facing faces; at most two people; a real-looking generic study room or study cafe (not a real place). Avoid the typical AI look: no glossy plastic skin, no perfect symmetry, no HDR glow, no oversaturated colors, no cinematic teal-orange grading, no stock-photo thumbs-up, no distorted hands or extra fingers"
      : "educational illustration for a private academy blog, a generic study space (not a real academy or real building)",
    p.data.colors.length ? `subtle accents of ${p.data.colors.join(", ")} in props or clothing only; overall palette warm and natural` : "",
    p.data.note ? `additional request: ${p.data.note}` : "",
    composition,
    realistic ? "square 1:1, looks like an unedited photo a real person took" : "square 1:1, high detail, professional quality",
    IMAGE_STYLE.negativePrompt,
  ]
    .filter(Boolean)
    .join(". ");

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", quality: QUALITY, n: 1 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      await undo();
      console.error("[illustration]", r.status, j?.error?.message);
      const msg =
        r.status === 401 ? "이미지 API 키가 올바르지 않습니다." : r.status === 429 ? "이미지 요청이 많아 잠시 제한되었습니다. 잠시 뒤 다시 시도해 주세요." : r.status === 400 ? "이 설명으로는 그림을 만들 수 없습니다. 설명을 바꿔 다시 시도해 주세요." : "일러스트를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
      return Response.json({ error: msg }, { status: 502 });
    }
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) {
      await undo();
      return Response.json({ error: "일러스트를 받지 못했습니다." }, { status: 502 });
    }
    return Response.json({ dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    await undo();
    console.error("[illustration]", e);
    return Response.json({ error: "이미지 서버에 연결하지 못했습니다." }, { status: 502 });
  }
}
