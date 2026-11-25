import "server-only";
import { SUPABASE_ENABLED, supabaseAdmin } from "./supabase/server";

// 호출 횟수 제한. DB(hit_rate_limit)로 모든 서버 인스턴스가 같은 횟수를 본다.
// DB 함수가 아직 없으면 인스턴스 메모리로 센다.
// shortcut: 메모리 기준은 서버 인스턴스마다 따로 세므로 느슨하다. 20261125000001_rate_limits.sql 을 적용하면 DB 기준으로 바뀐다.
const mem = new Map<string, { start: number; hits: number }>();
let warned = false;

function memHit(key: string, windowSec: number, max: number) {
  const now = Date.now();
  const cur = mem.get(key);
  const next = !cur || now - cur.start > windowSec * 1000 ? { start: now, hits: 1 } : { start: cur.start, hits: cur.hits + 1 };
  mem.set(key, next);
  if (mem.size > 5000) for (const [k, v] of mem) if (now - v.start > 86_400_000) mem.delete(k);
  return next.hits <= max;
}

/** key 로 windowSec 초 안에 max 번까지 허용한다. 넘으면 false */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  if (!SUPABASE_ENABLED) return memHit(key, windowSec, max);
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", { p_key: key, p_window: windowSec, p_max: max });
  if (error) {
    if (!warned) console.error("[rate-limit] DB 함수 사용 불가, 메모리로 셉니다:", error.message);
    warned = true;
    return memHit(key, windowSec, max);
  }
  return data === true;
}

/** Vercel 이 넣어 주는 접속 IP */
export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const tooMany = (error = "요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.") => Response.json({ error }, { status: 429 });

export const HOUR = 3600;
export const DAY = 86_400;
