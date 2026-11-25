import { toPhone } from "@/lib/phone";
import { SUPABASE_ENABLED, supabaseAdmin } from "@/lib/supabase/server";
import { allow, clientIp, tooMany } from "@/lib/rateLimit";

/** 가입 1단계: 이미 가입된 전화번호인지 미리 알려 준다(마지막 단계에서 되돌아오지 않게) */
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) return Response.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  if (!(await allow(`check:ip:${clientIp(req)}`, 60, 600))) return tooMany();
  const phone = toPhone(String((await req.json().catch(() => null))?.phone ?? ""));
  if (!phone) return Response.json({ error: "휴대폰 번호를 확인해 주세요." }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("profiles").select("user_id").eq("phone", phone).maybeSingle();
  if (error) {
    console.error("[auth:check]", error.message);
    return Response.json({ error: "가입 준비가 아직 안 됐습니다(DB 설정 필요). 관리자에게 문의해 주세요." }, { status: 503 });
  }
  return data ? Response.json({ error: "이미 가입된 전화번호입니다. 로그인해 주세요." }, { status: 409 }) : Response.json({ ok: true });
}
