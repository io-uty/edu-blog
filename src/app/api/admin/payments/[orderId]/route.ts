import { z } from "zod";
import { audit, requireAdmin, sameOrigin } from "@/lib/adminAuth";
import { confirmOrder } from "@/lib/bank";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * 운영자 전용: 입금 확인 대기 주문 처리
 *  - confirm: 운영자가 통장에서 입금을 직접 확인했을 때 이용권을 켠다(txId 를 주면 해당 입금 알림을 해결 처리)
 *  - cancel : 주문을 취소한다
 */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  if (!sameOrigin(req)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  const { orderId } = await params;
  const p = z.object({ action: z.enum(["confirm", "cancel"]), txId: z.string().max(100).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "요청을 확인해 주세요." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: pay } = await db.from("payments").select("order_id, status, amount, plan_id, provider").eq("order_id", orderId).maybeSingle();
  if (!pay || pay.provider !== "bank_transfer") return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (pay.status !== "pending") return Response.json({ error: "이미 처리된 주문입니다." }, { status: 409 });

  if (p.data.action === "cancel") {
    await db.from("payments").update({ status: "canceled", confirmed_by: `admin:${a.user.email}` }).eq("order_id", orderId).eq("status", "pending");
    await audit(a.user.email, "cancel_order", orderId, { amount: pay.amount });
    return Response.json({ ok: true });
  }
  const txId = p.data.txId ?? `manual:${orderId}`;
  const r = await confirmOrder(orderId, `admin:${a.user.email}`, txId);
  if (!r.ok) return Response.json({ error: r.error }, { status: 500 });
  if (p.data.txId) await db.from("deposit_events").update({ status: "resolved", order_id: orderId }).eq("tx_id", p.data.txId).in("status", ["unmatched", "ambiguous"]);
  await audit(a.user.email, "confirm_deposit", orderId, { amount: pay.amount, plan: pay.plan_id, txId });
  return Response.json({ ok: true });
}
