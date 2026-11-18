import "server-only";
import type { PromptCtx } from "./prompts";
import { parseBrand } from "./settings";
import { getSession, NO_TENANT_YET, SUPABASE_ENABLED, UNAUTHORIZED, type TenantSession } from "./supabase/server";
import { loadTenant } from "./tenantDb";
import { parseTenant } from "./tenant";

export type CtxResult = { ok: true; ctx: PromptCtx; session: TenantSession | null } | { ok: false; res: Response };

/**
 * AI 요청에 쓸 학원(테넌트) 정보를 구한다.
 * Supabase 사용 시: 로그인 사용자 → tenant_members → DB 에서 읽는다. 요청 본문의 학원 정보는 무시한다.
 * Supabase 미설정(로컬 개발) 시에만 본문의 학원 정보를 검증해서 쓴다.
 */
export async function getCtx(body: { tenant?: unknown; brand?: unknown }): Promise<CtxResult> {
  if (SUPABASE_ENABLED) {
    const session = await getSession();
    if (!session) return { ok: false, res: UNAUTHORIZED() };
    if (!session.tenantId) return { ok: false, res: NO_TENANT_YET() };
    try {
      const { tenant, settings } = await loadTenant(session.db, session.tenantId);
      return { ok: true, ctx: { tenant, brand: settings.brand }, session };
    } catch (e) {
      console.error("[getCtx]", e);
      return { ok: false, res: Response.json({ error: "학원 정보를 불러오지 못했습니다." }, { status: 500 }) };
    }
  }
  const tenant = parseTenant(body.tenant);
  if (!tenant || !tenant.name)
    return { ok: false, res: Response.json({ error: "학원 정보가 없습니다. 학원 정보를 먼저 등록해 주세요." }, { status: 400 }) };
  return { ok: true, ctx: { tenant, brand: parseBrand(body.brand) }, session: null };
}

/** 비용이 드는 API 를 로그인 사용자에게만 연다(Supabase 미설정 시 통과). */
export async function requireUser(): Promise<Response | null> {
  if (!SUPABASE_ENABLED) return null;
  const s = await getSession();
  return s ? null : UNAUTHORIZED();
}
