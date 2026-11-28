import { z } from "zod";
import { getSession, setCurrentTenant, UNAUTHORIZED } from "@/lib/supabase/server";

/** 보고 있는 학원을 바꾼다. 내가 소속된 학원만 고를 수 있다. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = z.object({ tenantId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "학원을 확인해 주세요." }, { status: 400 });
  const { data } = await s.db.from("tenant_members").select("tenant_id").eq("user_id", s.user.id).eq("tenant_id", p.data.tenantId).maybeSingle();
  if (!data) return Response.json({ error: "접근할 수 없는 학원입니다." }, { status: 403 });
  await setCurrentTenant(p.data.tenantId);
  return Response.json({ ok: true });
}
