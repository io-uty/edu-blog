import { z } from "zod";
import { checkQuality } from "@/lib/quality";
import { renderHtml, renderPlainText } from "@/lib/render";
import { DraftSchema } from "@/lib/schemas";
import { DEFAULT_SETTINGS, parseBrand } from "@/lib/settings";

// 하위 호환용: 편집한 초안을 다시 렌더링하고 품질 검사를 재실행한다.
// (화면에서는 같은 함수를 브라우저에서 바로 실행한다)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ draft: DraftSchema, brand: z.unknown().optional() }).safeParse(body);
  const draft = parsed.success ? parsed.data.draft : DraftSchema.safeParse(body).data;
  if (!draft) return Response.json({ error: "초안 형식 오류" }, { status: 400 });
  const brand = parseBrand(parsed.success ? parsed.data.brand : undefined);
  const s = { ...DEFAULT_SETTINGS, brand };
  return Response.json({ plainText: renderPlainText(draft, s), html: renderHtml(draft, s), quality: checkQuality(draft, brand) });
}
