import { createHmac, randomInt } from "node:crypto";
import { toPhone } from "@/lib/phone";
import { phoneVerifyOn, sendSms, smsReady } from "@/lib/sms";
import { SUPABASE_ENABLED, supabaseAdmin } from "@/lib/supabase/server";
import { HOUR, allow, clientIp, tooMany } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const hash = (phone: string, code: string) => createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`${phone}:${code}`).digest("hex");
const bad = (error: string, status: number) => Response.json({ error }, { status });

/** 가입 화면이 인증 단계를 보여 줄지 묻는다 */
export async function GET() {
  return Response.json({ required: phoneVerifyOn() });
}

/** 인증번호 문자 발송(6자리, 5분 유효). 이미 가입된 번호에는 보내지 않는다. */
// 번호당 60초 간격 + IP당 시간당 5회로 제한한다.
export async function POST(req: Request) {
  if (!phoneVerifyOn()) return bad("휴대폰 인증을 쓰지 않습니다.", 404);
  if (!SUPABASE_ENABLED) return bad("서버 설정이 필요합니다.", 503);
  const dev = !smsReady();
  if (dev && process.env.NODE_ENV === "production") return bad("문자 발송 준비 중입니다. 잠시 뒤 다시 시도해 주세요.", 503);
  const phone = toPhone(String((await req.json().catch(() => null))?.phone ?? ""));
  if (!phone) return bad("휴대폰 번호를 확인해 주세요.", 400);
  // 번호를 바꿔 가며 문자를 대량 발송하지 못하게 IP 단위로도 막는다
  if (!(await allow(`sms:ip:${clientIp(req)}`, 5, HOUR))) return tooMany("인증번호 요청이 너무 많습니다. 1시간 뒤 다시 시도해 주세요.");

  const admin = supabaseAdmin();
  const [taken, last] = await Promise.all([
    admin.from("profiles").select("user_id").eq("phone", phone).maybeSingle(),
    admin.from("phone_verifications").select("sent_at").eq("phone", phone).maybeSingle(),
  ]);
  if (taken.data) return bad("이미 가입된 전화번호입니다.", 409);
  if (last.data && Date.now() - new Date(last.data.sent_at).getTime() < 60_000) return bad("인증번호는 1분 뒤에 다시 받을 수 있습니다.", 429);

  const code = String(randomInt(100000, 1000000));
  const { error } = await admin.from("phone_verifications").upsert({
    phone,
    code_hash: hash(phone, code),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    sent_at: new Date().toISOString(),
    attempts: 0,
    verified_at: null,
  });
  if (error) return bad("인증번호를 보내지 못했습니다.", 500);
  if (dev) {
    console.log(`[sms:dev] ${phone} 인증번호 ${code}`);
    return Response.json({ ok: true, devCode: code });
  }
  if (!(await sendSms(phone, `[뚝딱] 인증번호는 ${code} 입니다. (5분 이내 입력)`))) return bad("문자를 보내지 못했습니다. 번호를 확인해 주세요.", 502);
  return Response.json({ ok: true });
}

/** 인증번호 확인 */
export async function PUT(req: Request) {
  if (!phoneVerifyOn()) return bad("휴대폰 인증을 쓰지 않습니다.", 404);
  if (!SUPABASE_ENABLED) return bad("서버 설정이 필요합니다.", 503);
  const b = await req.json().catch(() => null);
  const phone = toPhone(String(b?.phone ?? ""));
  const code = String(b?.code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(code)) return bad("인증번호 6자리를 입력해 주세요.", 400);
  const { data } = await supabaseAdmin().rpc("verify_phone", { p_phone: phone, p_hash: hash(phone, code) });
  return data ? Response.json({ ok: true }) : bad("인증번호가 맞지 않거나 만료되었습니다. 다시 확인하거나 새로 받아 주세요.", 400);
}
