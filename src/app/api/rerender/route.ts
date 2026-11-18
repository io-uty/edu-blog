import { checkQuality } from "@/lib/quality";
import { renderHtml, renderPlainText } from "@/lib/render";
import { DraftSchema } from "@/lib/schemas";

// 사용자가 편집한 초안을 다시 렌더링하고 품질 검사를 재실행한다.
export async function POST(req: Request) {
  const parsed = DraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "초안 형식 오류" }, { status: 400 });
  const d = parsed.data;
  return Response.json({ plainText: renderPlainText(d), html: renderHtml(d), quality: checkQuality(d) });
}
