import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSession, supabaseAdmin, SUPABASE_ENABLED } from "./supabase/server";

/** 운영자 확인: 로그인(메일 확인 완료)한 계정이 platform_admins 에 등록돼 있어야 한다. 본 앱의 학원 권한과는 별개. */
export type AdminCheck = { ok: true; user: User } | { ok: false; res: Response };

export async function requireAdmin(): Promise<AdminCheck> {
  if (!SUPABASE_ENABLED) return { ok: false, res: Response.json({ error: "DB 가 연결되지 않았습니다." }, { status: 400 }) };
  const s = await getSession();
  if (!s) return { ok: false, res: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", s.user.id).maybeSingle();
  if (!data || !s.user.email_confirmed_at) return { ok: false, res: Response.json({ error: "접근 권한이 없습니다." }, { status: 403 }) };
  return { ok: true, user: s.user };
}

/** 삭제·초기화 같은 변경 요청은 같은 사이트에서 온 것만 받는다(다른 사이트에서의 위조 요청 방지). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function audit(email: string | null | undefined, action: string, target: string | null, detail: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin().from("admin_audit").insert({ admin_email: email ?? null, action, target, detail });
  if (error) console.error("[admin:audit]", error.message);
}
