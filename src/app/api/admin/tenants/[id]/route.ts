import { z } from "zod";
import { audit, requireAdmin, sameOrigin } from "@/lib/adminAuth";
import { tenantDetail } from "@/lib/adminStats";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const idOk = (id: string) => z.string().uuid().safeParse(id).success;

/** 운영자 전용: 학원 한 곳의 상세(콘텐츠 목록·사용 기록·결제·이벤트). 글 본문은 포함하지 않는다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  const { id } = await params;
  if (!idOk(id)) return Response.json({ error: "잘못된 학원입니다." }, { status: 400 });
  const d = await tenantDetail(id);
  if (!d) return Response.json({ error: "학원을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(d);
}

/**
 * 운영자 전용: 학원 한 곳과 딸린 데이터(글·설정·사용·결제·이벤트)를 삭제한다.
 * 학원명을 그대로 입력해야 한다. alsoAccount=true 면 소유 계정(운영자 제외)도 함께 삭제한다.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  if (!sameOrigin(req)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  const { id } = await params;
  if (!idOk(id)) return Response.json({ error: "잘못된 학원입니다." }, { status: 400 });
  const body = z.object({ confirm: z.string().max(120), alsoAccount: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "확인 문구를 입력해 주세요." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: t } = await db.from("tenants").select("id, name, branch_name").eq("id", id).maybeSingle();
  if (!t) return Response.json({ error: "학원을 찾을 수 없습니다." }, { status: 404 });
  if (body.data.confirm.trim() !== t.name) return Response.json({ error: "학원명이 일치하지 않아 삭제하지 않았습니다." }, { status: 400 });

  const [{ count: projects }, { data: members }] = await Promise.all([
    db.from("projects").select("id", { count: "exact", head: true }).eq("tenant_id", id),
    db.from("tenant_members").select("user_id").eq("tenant_id", id),
  ]);
  const { error } = await db.from("tenants").delete().eq("id", id);
  if (error) {
    console.error("[admin:delete-tenant]", error.message);
    return Response.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }

  let accounts = 0;
  if (body.data.alsoAccount) {
    const { data: admins } = await db.from("platform_admins").select("user_id");
    const keep = new Set((admins ?? []).map((x) => x.user_id));
    for (const m of members ?? []) {
      if (keep.has(m.user_id)) continue; // 운영자 계정은 지우지 않는다
      const r = await db.auth.admin.deleteUser(m.user_id);
      if (!r.error) accounts++;
    }
  }
  await audit(a.user.email, "delete_tenant", [t.name, t.branch_name].filter(Boolean).join(" "), { tenantId: id, projects: projects ?? 0, accountsDeleted: accounts });
  return Response.json({ ok: true, projects: projects ?? 0, accountsDeleted: accounts });
}
