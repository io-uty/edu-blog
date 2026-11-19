import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** 운영자 화면이 열려도 되는지 확인(401: 로그인 필요 / 403: 권한 없음) */
export async function GET() {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  return Response.json({ ok: true, email: a.user.email });
}
