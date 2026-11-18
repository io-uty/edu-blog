import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 매 요청마다 Supabase 세션 쿠키를 갱신한다(@supabase/ssr 권장 방식).
/** SITE_PASSWORD 가 설정되면 사이트 전체에 접속 비밀번호(HTTP Basic)를 건다(데모 공유용). */
function passwordGate(req: NextRequest): NextResponse | null {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return null;
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Basic ")) {
    try {
      const decoded = atob(h.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given === pw) return null;
    } catch {
      /* 잘못된 헤더 */
    }
  }
  return new NextResponse("접속 비밀번호가 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="bbolog", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(req: NextRequest) {
  const gate = passwordGate(req);
  if (gate) return gate;
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
