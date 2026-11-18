import { z } from "zod";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { SettingsInputSchema, saveSettings, saveTenantProfile } from "@/lib/tenantDb";
import { TenantProfileSchema } from "@/lib/tenant";

const Body = z.object({ tenant: TenantProfileSchema, settings: SettingsInputSchema });

/** 학원 등록(첫 온보딩) 또는 학원 정보 저장 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "학원 정보 형식을 확인해 주세요." }, { status: 400 });

  let tenantId = s.tenantId;
  if (!tenantId) {
    // 테넌트 생성은 서버만 한다(멤버·체험 구독을 한 트랜잭션으로)
    const { data, error } = await supabaseAdmin().rpc("create_tenant_for_user", {
      p_user: s.user.id,
      p_name: p.data.tenant.name,
      p_type: p.data.tenant.academyType,
    });
    if (error || !data) {
      console.error("[tenant:create]", error?.message);
      return Response.json({ error: "학원을 등록하지 못했습니다." }, { status: 500 });
    }
    tenantId = data as string;
  } else if (s.role === "editor") {
    return Response.json({ error: "학원 정보는 관리자만 수정할 수 있습니다." }, { status: 403 });
  }

  try {
    await saveTenantProfile(s.db, tenantId, p.data.tenant);
    await saveSettings(s.db, tenantId, p.data.settings);
    return Response.json({ ok: true, tenantId });
  } catch (e) {
    console.error("[tenant:save]", e);
    return Response.json({ error: "학원 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}

/** 블로그 설정만 저장 */
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return Response.json({ error: "학원 정보를 먼저 등록해 주세요." }, { status: 403 });
  const p = z.object({ settings: SettingsInputSchema }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "설정 형식을 확인해 주세요." }, { status: 400 });
  try {
    await saveSettings(s.db, s.tenantId, p.data.settings);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[settings:save]", e);
    return Response.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 });
  }
}
