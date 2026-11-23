import "server-only";
import { createHmac, randomBytes } from "node:crypto";

// 문자 발송: Solapi(솔라피) REST. 키가 없으면 개발 모드(문자를 보내지 않고 인증번호를 서버 로그·응답으로 돌려줌).
const { SOLAPI_API_KEY: KEY, SOLAPI_API_SECRET: SECRET, SMS_SENDER: FROM } = process.env;

export const smsReady = () => !!(KEY && SECRET && FROM);

export async function sendSms(to: string, text: string): Promise<boolean> {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", SECRET!).update(date + salt).digest("hex");
  const r = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${signature}` },
    body: JSON.stringify({ message: { to, from: FROM, text } }),
  }).catch(() => null);
  return !!r?.ok;
}
