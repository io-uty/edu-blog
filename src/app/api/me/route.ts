import { SUPABASE_ENABLED, getSession } from "@/lib/supabase/server";
import { loadTenant } from "@/lib/tenantDb";

export const dynamic = "force-dynamic";

/** 현재 사용자·소속 학원·설정. 학원 정보는 서버가 DB 에서 읽는다. */
export async function GET() {
  if (!SUPABASE_ENABLED) return Response.json({ mode: "local" });
  const s = await getSession();
  if (!s) return Response.json({ mode: "cloud", user: null }, { status: 401 });
  // 이 계정이 가진 학원 목록(왼쪽 아래 학원 전환 메뉴)
  const { data: rows } = await s.db.from("tenant_members").select("tenant_id, created_at, tenants(name, branch_name)").eq("user_id", s.user.id).order("created_at");
  const tenants = (rows ?? []).map((r) => {
    const t = r.tenants as unknown as { name: string; branch_name: string | null } | null;
    return { id: r.tenant_id as string, name: [t?.name, t?.branch_name].filter(Boolean).join(" ") };
  });
  const base = { mode: "cloud", user: { id: s.user.id, email: s.user.email }, role: s.role, tenants };
  if (!s.tenantId) return Response.json({ ...base, tenant: null, settings: null });
  try {
    const { tenant, settings } = await loadTenant(s.db, s.tenantId);
    return Response.json({ ...base, tenantId: s.tenantId, tenant, settings });
  } catch (e) {
    console.error("[me]", e);
    return Response.json({ error: "학원 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
