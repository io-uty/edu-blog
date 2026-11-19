import { z } from "zod";
import { audit, requireAdmin, sameOrigin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NIL = "00000000-0000-0000-0000-000000000000";
const CONFIRM = { data: "데이터 초기화", all: "전체 삭제" } as const;

/**
 * 운영자 전용 초기화.
 *  - data: 학원·글·사용량·결제·이벤트를 모두 지운다(가입 계정은 유지 → 다시 로그인하면 학원 등록부터 시작)
 *  - all : 위 + 가입 계정도 모두 지운다(운영자 계정은 항상 유지)
 * 요금제 설정(plans)·운영자 등록·삭제 기록은 어떤 경우에도 지우지 않는다.
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  if (!sameOrigin(req)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  const body = z.object({ scope: z.enum(["data", "all"]), confirm: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "요청을 확인해 주세요." }, { status: 400 });
  const { scope, confirm } = body.data;
  if (confirm.trim() !== CONFIRM[scope]) return Response.json({ error: `확인 문구가 일치하지 않아 실행하지 않았습니다. “${CONFIRM[scope]}”를 정확히 입력해 주세요.` }, { status: 400 });

  const db = supabaseAdmin();
  const count = async (t: string) => (await db.from(t).select("*", { count: "exact", head: true })).count ?? 0;
  const before = { tenants: await count("tenants"), projects: await count("projects"), payments: await count("payments"), events: await count("product_events") };

  const steps: { name: string; error?: string }[] = [];
  const run = async (name: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const r = await p;
    steps.push({ name, error: r.error?.message });
  };
  // 학원 삭제 → 멤버·브랜드·설정·출처·글·이미지·구독·결제·사용량·이벤트가 함께 삭제된다(FK cascade)
  await run("학원 및 딸린 데이터", db.from("tenants").delete().neq("id", NIL));
  await run("학원 없는 이벤트", db.from("product_events").delete().neq("id", NIL));
  await run("동의 기록", db.from("user_consents").delete().neq("user_id", NIL));

  let accountsDeleted = 0;
  if (scope === "all") {
    const { data: admins } = await db.from("platform_admins").select("user_id");
    const keep = new Set((admins ?? []).map((x) => x.user_id));
    keep.add(a.user.id);
    for (let page = 1; page < 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) { steps.push({ name: "계정 목록", error: error.message }); break; }
      for (const u of data.users) {
        if (keep.has(u.id)) continue;
        const r = await db.auth.admin.deleteUser(u.id);
        if (r.error) steps.push({ name: `계정 ${u.id.slice(0, 8)}`, error: r.error.message });
        else accountsDeleted++;
      }
      if (data.users.length < 200) break;
    }
  }

  const failed = steps.filter((s) => s.error);
  await audit(a.user.email, scope === "all" ? "reset_all" : "reset_data", null, { before, accountsDeleted, failed: failed.map((f) => f.name) });
  if (failed.length) return Response.json({ ok: false, error: `일부 삭제에 실패했습니다: ${failed.map((f) => f.name).join(", ")}`, before, accountsDeleted }, { status: 500 });
  return Response.json({ ok: true, before, accountsDeleted });
}
