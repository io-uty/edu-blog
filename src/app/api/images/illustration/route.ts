import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { getSession, SUPABASE_ENABLED } from "@/lib/supabase/server";
import { consume, refund } from "@/lib/usage";
import { randomUUID } from "node:crypto";
import { IMAGE_STYLE } from "@/config/imageStyle";
import { ILLUSTRATION_STYLES } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 120;

// 글자 없는 일러스트만 생성한다(제목·로고·숫자는 브라우저에서 코드로 얹음).
// OPENAI_API_KEY 가 있을 때만 동작한다. 모델은 IMAGE_MODEL(기본 gpt-image-1).
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

const Body = z.object({
  scene: z.string().trim().min(3).max(600),
  style: z.enum(["flat", "cute", "webtoon", "watercolor", "clay"]).default("cute"),
  note: z.string().max(200).default(""),
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
    if (!r.allowed) return Response.json({ code: "QUOTA_EXCEEDED", error: "이미지 생성 횟수를 모두 사용했습니다. 이용권을 선택해 주세요." }, { status: 402 });
  }
  const undo = async () => {
    if (session?.tenantId) await refund(session.tenantId, session.user.id, "image", key);
  };

  const prompt = [
    p.data.scene,
    ILLUSTRATION_STYLES[p.data.style].prompt,
    p.data.colors.length ? `use ${p.data.colors.join(", ")} only as small accent colors, keep the rest neutral` : "",
    p.data.note ? `additional request: ${p.data.note}` : "",
    "educational illustration for a private academy blog, a generic study space (not a real academy or real building)",
    "main subject placed in the right half and lower part of the canvas; keep the upper-left area as a simple flat background for text overlay",
    "square 1:1",
    IMAGE_STYLE.negativePrompt,
  ]
    .filter(Boolean)
    .join(". ");

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", n: 1 }),
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
