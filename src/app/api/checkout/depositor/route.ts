import { z } from "zod";
import { nameMatches } from "@/lib/bank";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";

/** 입금자명 저장: 통장에 찍히는 이름. 같은 금액의 다른 대기 주문과 겹치면(자동 확인이 헷갈리므로) 거부한다. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = z
    .object({ orderId: z.string().max(64), depositorName: z.string().trim().min(2).max(20).regex(/^[0-9A-Za-z가-힣 ]+$/, "한글·영문·숫자만 쓸 수 있습니다.") })
    .safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "입금자명은 2~20자의 한글·영문·숫자로 입력해 주세요." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: pay } = await db.from("payments").select("order_id, tenant_id, amount, status, provider, expires_at").eq("order_id", p.data.orderId).maybeSingle();
  if (!pay || pay.tenant_id !== s.tenantId || pay.provider !== "bank_transfer") return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (pay.status !== "pending") return Response.json({ error: "이미 처리된 주문입니다." }, { status: 409 });
  if (pay.expires_at && new Date(pay.expires_at) < new Date()) return Response.json({ error: "주문 시간이 지났습니다. 생성권을 다시 선택해 주세요." }, { status: 410 });

  const { data: others } = await db
    .from("payments")
    .select("depositor_name")
    .eq("provider", "bank_transfer")
    .eq("status", "pending")
    .eq("amount", pay.amount)
    .neq("order_id", pay.order_id)
    .not("depositor_name", "is", null)
    .gt("expires_at", new Date().toISOString());
  if ((others ?? []).some((o) => nameMatches(o.depositor_name as string, p.data.depositorName) || nameMatches(p.data.depositorName, o.depositor_name as string)))
    return Response.json({ error: "지금 같은 이름으로 입금 대기 중인 다른 주문이 있습니다. 이름 앞에 숫자를 붙여 다르게 입력해 주세요(예: 2홍길동)." }, { status: 409 });

  const { error } = await db.from("payments").update({ depositor_name: p.data.depositorName }).eq("order_id", pay.order_id).eq("status", "pending");
  if (error) return Response.json({ error: "저장하지 못했습니다." }, { status: 500 });
  return Response.json({ ok: true, depositorName: p.data.depositorName });
}
