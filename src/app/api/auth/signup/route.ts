import { z } from "zod";
import { toPhone } from "@/lib/phone";
import { phoneVerifyOn } from "@/lib/sms";
import { SUPABASE_ENABLED, supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import { HOUR, allow, clientIp, tooMany } from "@/lib/rateLimit";

const Body = z.object({
  name: z.string().trim().min(1).max(30),
  phone: z.string(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  loginId: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{4,20}$/),
  password: z.string().min(8).max(72),
});
const bad = (error: string, status: number) => Response.json({ error }, { status });

/** 가입: 전화번호·아이디 중복은 DB 제약이 막고, 실패하면 만든 계정을 되돌린다. PHONE_VERIFY=on 이면 휴대폰 인증을 마친 번호만 허용. */
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) return bad("서버 설정이 필요합니다.", 503);
  if (!(await allow(`signup:ip:${clientIp(req)}`, 5, HOUR))) return tooMany("가입 시도가 너무 많습니다. 1시간 뒤 다시 시도해 주세요.");
  const p = Body.safeParse(await req.json().catch(() => null));
  const phone = p.success ? toPhone(p.data.phone) : null;
  if (!p.success || !phone) return bad("입력한 내용을 확인해 주세요. 아이디는 영문 소문자·숫자·_ 4~20자, 비밀번호는 8자 이상입니다.", 400);
  const { name, email, loginId, password } = p.data;

  const admin = supabaseAdmin();
  if (phoneVerifyOn()) {
    const { data: v } = await admin
      .from("phone_verifications")
      .select("phone")
      .eq("phone", phone)
      .gt("verified_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .maybeSingle();
    if (!v) return bad("휴대폰 인증을 먼저 완료해 주세요.", 403);
  }

  // 확인 메일은 보내지 않는다(가입 즉시 사용). 본인 확인이 필요하면 PHONE_VERIFY=on
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !u.user) return bad(/registered|exists/i.test(error?.message ?? "") ? "이미 가입된 이메일입니다." : "가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", /registered|exists/i.test(error?.message ?? "") ? 409 : 500);

  const { error: pe } = await admin.from("profiles").insert({ user_id: u.user.id, name, phone, email, login_id: loginId });
  if (pe) {
    await admin.auth.admin.deleteUser(u.user.id);
    if (pe.code === "23505") return bad(pe.message.includes("phone") ? "이미 가입된 전화번호입니다." : "이미 사용 중인 아이디입니다.", 409);
    console.error("[auth:signup]", pe.code, pe.message);
    return bad("가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
  if (phoneVerifyOn()) await admin.from("phone_verifications").delete().eq("phone", phone);

  const { error: se } = await (await supabaseUser()).auth.signInWithPassword({ email, password });
  return se ? bad("가입은 완료되었습니다. 로그인해 주세요.", 500) : Response.json({ ok: true });
}
