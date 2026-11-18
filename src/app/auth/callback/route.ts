import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

// 가입 확인 메일의 링크가 돌아오는 곳: 코드를 세션으로 바꾸고 앱으로 보낸다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await supabaseUser();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
