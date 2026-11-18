import { z } from "zod";
import { requireUser } from "@/lib/requestCtx";
import { IMAGE_STYLE } from "@/config/imageStyle";

export const runtime = "nodejs";
export const maxDuration = 120;

// 글자 없는 일러스트만 생성한다(제목·로고·숫자는 브라우저에서 코드로 얹음).
// OPENAI_API_KEY 가 있을 때만 동작한다. 모델은 IMAGE_MODEL(기본 gpt-image-1).
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

const Body = z.object({ scene: z.string().trim().min(3).max(600) });

export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  if (!KEY) return Response.json({ error: "일러스트 생성 API가 설정되지 않았습니다." }, { status: 501 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "일러스트 설명을 확인해 주세요." }, { status: 400 });

  const prompt = [
    p.data.scene,
    "Korean webtoon / anime-style clean illustration, soft cel shading, bright and friendly",
    "main subject placed in the right half and lower part of the canvas; keep the upper-left area as a simple flat background for text overlay",
    "square 1:1",
    IMAGE_STYLE.negativePrompt,
  ].join(". ");

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", n: 1 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("[illustration]", r.status, j?.error?.message);
      const msg =
        r.status === 401 ? "이미지 API 키가 올바르지 않습니다." : r.status === 429 ? "이미지 요청이 많아 잠시 제한되었습니다. 잠시 뒤 다시 시도해 주세요." : r.status === 400 ? "이 설명으로는 그림을 만들 수 없습니다. 설명을 바꿔 다시 시도해 주세요." : "일러스트를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
      return Response.json({ error: msg }, { status: 502 });
    }
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: "일러스트를 받지 못했습니다." }, { status: 502 });
    return Response.json({ dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error("[illustration]", e);
    return Response.json({ error: "이미지 서버에 연결하지 못했습니다." }, { status: 502 });
  }
}
