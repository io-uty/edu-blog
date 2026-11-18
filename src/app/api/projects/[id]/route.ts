import { z } from "zod";
import { getSession, NO_TENANT_YET, UNAUTHORIZED } from "@/lib/supabase/server";
import { rowToDoc } from "@/lib/tenantDb";

const Patch = z.object({
  title: z.string().max(300).optional(),
  draft: z.unknown().optional(),
  plan: z.unknown().optional(),
  images: z.array(z.unknown()).max(12).optional(),
  status: z.enum(["draft", "ready", "published_confirmed"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

/** 콘텐츠 저장(자동 저장). RLS 가 같은 학원 콘텐츠만 수정되게 한다. */
export async function PUT(req: Request, { params }: Params) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return NO_TENANT_YET();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "잘못된 콘텐츠입니다." }, { status: 400 });
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "콘텐츠 형식을 확인해 주세요." }, { status: 400 });
  const d = p.data;
  const { data, error } = await s.db
    .from("projects")
    .update({
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.draft !== undefined ? { draft: d.draft } : {}),
      ...(d.plan !== undefined ? { plan: d.plan } : {}),
      ...(d.images !== undefined ? { image_items: d.images } : {}),
      ...(d.status ? { status: d.status, published_confirmed_at: d.status === "published_confirmed" ? new Date().toISOString() : null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", s.tenantId)
    .select("*")
    .maybeSingle();
  if (error) return Response.json({ error: "저장하지 못했습니다." }, { status: 500 });
  if (!data) return Response.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ doc: rowToDoc(data) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return NO_TENANT_YET();
  const { id } = await params;
  const { data, error } = await s.db.from("projects").delete().eq("id", id).eq("tenant_id", s.tenantId).select("id");
  if (error) return Response.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  if (!data?.length) return Response.json({ error: "삭제 권한이 없거나 이미 삭제되었습니다." }, { status: 404 });
  return Response.json({ ok: true });
}
