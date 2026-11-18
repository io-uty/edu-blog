import "server-only";
import type { PromptCtx } from "./prompts";
import { parseBrand } from "./settings";
import { parseTenant } from "./tenant";

/**
 * 요청에서 학원(테넌트) 정보를 읽는다.
 * 지금은 브라우저가 보낸 학원 정보를 검증해서 쓴다.
 * TODO(Supabase 연결 후): 요청 본문 대신 로그인 사용자 → tenant_members → DB 에서 읽고, 본문의 값은 무시한다.
 */
export function readCtx(body: { tenant?: unknown; brand?: unknown }): PromptCtx | null {
  const tenant = parseTenant(body.tenant);
  if (!tenant || !tenant.name) return null;
  return { tenant, brand: parseBrand(body.brand) };
}

export const NO_TENANT = () =>
  Response.json({ error: "학원 정보가 없습니다. 학원 정보를 먼저 등록해 주세요." }, { status: 400 });
