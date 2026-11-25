import { z } from "zod";
import { SUPABASE_ENABLED, supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import { allow, clientIp, tooMany } from "@/lib/rateLimit";

const Body = z.object({ loginId: z.string().trim().toLowerCase().min(1).max(100), password: z.string().min(1).max(100) });

/** 아이디(또는 기존 이메일 계정의 이메일)와 비밀번호로 로그인 */
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) return Response.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!(await allow(`login:ip:${clientIp(req)}`, 30, 900)) || (p.success && !(await allow(`login:id:${p.data.loginId}`, 10, 900))))
    return tooMany("로그인 시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.");
  let email = p.success ? p.data.loginId : "";
  if (p.success && !email.includes("@")) {
    const { data } = await supabaseAdmin().from("profiles").select("email").eq("login_id", email).maybeSingle();
    email = data?.email ?? "";
  }
  const { error } = p.success && email ? await (await supabaseUser()).auth.signInWithPassword({ email, password: p.data.password }) : { error: true };
  return error ? Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 }) : Response.json({ ok: true });
}
