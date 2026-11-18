import { z } from "zod";
import { paymentProvider } from "@/lib/payments";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { logEvent } from "@/lib/usage";

/** 결제 승인: PG 검증(테스트 모드에서는 금액·키 확인)을 통과한 주문만 이용권을 활성화한다. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = z.object({ orderId: z.string().max(64), paymentKey: z.string().max(200), amount: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "결제 정보를 확인해 주세요." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pay } = await admin.from("payments").select("tenant_id, amount, status, plan_id").eq("order_id", p.data.orderId).maybeSingle();
  if (!pay || pay.tenant_id !== s.tenantId) return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (pay.status === "paid") return Response.json({ ok: true, already: true });
  if (pay.status !== "pending") return Response.json({ error: "결제할 수 없는 주문입니다." }, { status: 409 });

  const result = await paymentProvider().confirm(p.data, pay.amount);
  if (!result.ok) {
    await admin.from("payments").update({ status: "failed", raw: { reason: result.message } }).eq("order_id", p.data.orderId).eq("status", "pending");
    return Response.json({ error: result.message ?? "결제를 확인하지 못했습니다." }, { status: 402 });
  }
  const { error } = await admin.rpc("activate_subscription", { p_order: p.data.orderId, p_payment_key: p.data.paymentKey, p_raw: result.raw });
  if (error) {
    console.error("[checkout:confirm]", error.message);
    return Response.json({ error: "이용권을 활성화하지 못했습니다. 고객센터로 문의해 주세요." }, { status: 500 });
  }
  await logEvent(s.tenantId, s.user.id, "payment_completed", { plan: pay.plan_id, mode: "test" }, p.data.orderId);
  return Response.json({ ok: true });
}
