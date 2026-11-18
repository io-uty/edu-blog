import { SUPABASE_ENABLED, getSession } from "@/lib/supabase/server";
import { loadTenant } from "@/lib/tenantDb";

export const dynamic = "force-dynamic";

/** 현재 사용자·소속 학원·설정. 학원 정보는 서버가 DB 에서 읽는다. */
export async function GET() {
  if (!SUPABASE_ENABLED) return Response.json({ mode: "local" });
  const s = await getSession();
  if (!s) return Response.json({ mode: "cloud", user: null }, { status: 401 });
  const base = { mode: "cloud", user: { id: s.user.id, email: s.user.email }, role: s.role };
  if (!s.tenantId) return Response.json({ ...base, tenant: null, settings: null });
  try {
    const { tenant, settings } = await loadTenant(s.db, s.tenantId);
    return Response.json({ ...base, tenantId: s.tenantId, tenant, settings });
  } catch (e) {
    console.error("[me]", e);
    return Response.json({ error: "학원 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
