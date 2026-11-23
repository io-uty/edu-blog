import { z } from "zod";
import { SUPABASE_ENABLED, supabaseAdmin, supabaseUser } from "@/lib/supabase/server";

const Body = z.object({ loginId: z.string().trim().toLowerCase().min(1).max(100), password: z.string().min(1).max(100) });

/** 아이디(또는 기존 이메일 계정의 이메일)와 비밀번호로 로그인 */
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) return Response.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  const p = Body.safeParse(await req.json().catch(() => null));
  let email = p.success ? p.data.loginId : "";
  if (p.success && !email.includes("@")) {
    const { data } = await supabaseAdmin().from("profiles").select("email").eq("login_id", email).maybeSingle();
    email = data?.email ?? "";
  }
  const { error } = p.success && email ? await (await supabaseUser()).auth.signInWithPassword({ email, password: p.data.password }) : { error: true };
  return error ? Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 }) : Response.json({ ok: true });
}
