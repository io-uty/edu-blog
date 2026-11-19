import { z } from "zod";
import { getSession, SUPABASE_ENABLED } from "@/lib/supabase/server";
import { logEvent } from "@/lib/usage";

// 화면에서 생기는 이벤트 중 허용한 것만 기록한다(본문·개인정보 저장 안 함).
const ALLOWED = ["pricing_viewed", "purchase_clicked", "content_copied", "image_downloaded", "package_downloaded", "naver_write_opened"] as const;

export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) return Response.json({ ok: true });
  const s = await getSession();
  if (!s) return Response.json({ ok: false }, { status: 401 });
  const p = z.object({ type: z.enum(ALLOWED), plan: z.string().max(40).optional(), kind: z.enum(["title", "body", "tags", "single", "all", "package"]).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false }, { status: 400 });
  await logEvent(s.tenantId, s.user.id, p.data.type, { ...(p.data.plan ? { plan: p.data.plan } : {}), ...(p.data.kind ? { kind: p.data.kind } : {}) });
  return Response.json({ ok: true });
}
