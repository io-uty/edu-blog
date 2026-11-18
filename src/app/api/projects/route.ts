import { z } from "zod";
import { getSession, NO_TENANT_YET, UNAUTHORIZED } from "@/lib/supabase/server";
import { DocInputSchema, docToRow, rowToDoc } from "@/lib/tenantDb";

export const dynamic = "force-dynamic";

/** 내 학원의 콘텐츠 목록(RLS 로 다른 학원 콘텐츠는 보이지 않음) */
export async function GET() {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return NO_TENANT_YET();
  const { data, error } = await s.db.from("projects").select("*").eq("tenant_id", s.tenantId).order("updated_at", { ascending: false }).limit(200);
  if (error) return Response.json({ error: "콘텐츠를 불러오지 못했습니다." }, { status: 500 });
  return Response.json({ docs: data.map(rowToDoc) });
}

/** 콘텐츠 생성 · 이 브라우저에 있던 글 가져오기(여러 개) */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return NO_TENANT_YET();
  const p = z.object({ docs: z.array(DocInputSchema).min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "콘텐츠 형식을 확인해 주세요." }, { status: 400 });
  // 가져오는 글은 새 id 로 만든다(다른 계정에서 같은 id 를 넣어 충돌시키는 것 방지)
  const rows = p.data.docs.map((d) => docToRow({ ...d, id: undefined }, s.tenantId!, s.user.id));
  const { data, error } = await s.db.from("projects").insert(rows).select("*");
  if (error) {
    console.error("[projects:create]", error.message);
    return Response.json({ error: "콘텐츠를 저장하지 못했습니다." }, { status: 500 });
  }
  return Response.json({ docs: data.map(rowToDoc) });
}
