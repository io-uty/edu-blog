import { z } from "zod";
import { getSession, setCurrentTenant, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { SettingsInputSchema, saveSettings, saveTenantProfile } from "@/lib/tenantDb";
import { TenantProfileSchema } from "@/lib/tenant";
import { logEvent } from "@/lib/usage";

// create: 이미 학원이 있어도 새 학원을 추가한다(한 계정 = 여러 학원)
const Body = z.object({ tenant: TenantProfileSchema, settings: SettingsInputSchema, create: z.boolean().optional() });

const DUPLICATE_MESSAGE = "이미 등록된 학원입니다. 같은 이름의 지점이 따로 있다면 지점명을 입력해 주세요. 본인 학원인데 다른 계정으로 등록되어 있다면 그 계정으로 로그인해 주세요.";

/** 학원 등록(첫 온보딩·학원 추가) 또는 지금 학원 정보 저장 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "학원 정보 형식을 확인해 주세요." }, { status: 400 });

  let tenantId = p.data.create ? null : s.tenantId;
  if (!tenantId) {
    // 테넌트 생성은 서버만 한다(멤버·체험 구독을 한 트랜잭션으로)
    const { data, error } = await supabaseAdmin().rpc("create_tenant_for_user", {
      p_user: s.user.id,
      p_name: p.data.tenant.name,
      p_type: p.data.tenant.academyType,
      p_branch: p.data.tenant.branch,
    });
    if (error?.code === "23505") return Response.json({ error: DUPLICATE_MESSAGE, code: "DUPLICATE_TENANT" }, { status: 409 });
    if (error || !data) {
      console.error("[tenant:create]", error?.message);
      return Response.json({ error: "학원을 등록하지 못했습니다." }, { status: 500 });
    }
    tenantId = data as string;
    await setCurrentTenant(tenantId);
    await logEvent(tenantId, s.user.id, "onboarding_completed", { type: p.data.tenant.academyType }, "first");
  } else if (s.role === "editor") {
    return Response.json({ error: "학원 정보는 관리자만 수정할 수 있습니다." }, { status: 403 });
  }

  try {
    await saveTenantProfile(s.db, tenantId, p.data.tenant);
    await saveSettings(s.db, tenantId, p.data.settings);
    return Response.json({ ok: true, tenantId });
  } catch (e) {
    // 이름을 바꿨는데 이미 있는 학원명+지점명이면 거부(DB 제약)
    if ((e as { code?: string })?.code === "23505") return Response.json({ error: DUPLICATE_MESSAGE, code: "DUPLICATE_TENANT" }, { status: 409 });
    console.error("[tenant:save]", e);
    return Response.json({ error: "학원 정보를 저장하지 못했습니다." }, { status: 500 });
  }
}

/** 블로그 설정만 저장 */
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return Response.json({ error: "학원 정보를 먼저 등록해 주세요." }, { status: 403 });
  if (s.role === "editor") return Response.json({ error: "블로그 설정은 관리자만 수정할 수 있습니다." }, { status: 403 });
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
