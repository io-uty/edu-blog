import { z } from "zod";
import { confirmPayment } from "@/lib/payments";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { logEvent } from "@/lib/usage";

/**
 * 결제 승인: 토스가 승인하고 금액·주문번호가 일치한 주문만 이용권을 활성화한다.
 * 결제 성공 화면이 새로고침·중복 호출돼도 이용권은 한 번만 반영된다.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const p = z.object({ orderId: z.string().max(64), paymentKey: z.string().max(200), amount: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "결제 정보를 확인해 주세요." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pay } = await admin.from("payments").select("tenant_id, amount, status, plan_id, mode, provider").eq("order_id", p.data.orderId).maybeSingle();
  if (!pay || pay.tenant_id !== s.tenantId) return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (pay.provider !== "toss") return Response.json({ error: "카드 결제 주문이 아닙니다." }, { status: 400 });
  if (pay.status === "paid") return Response.json({ ok: true, already: true });
  if (pay.status !== "pending") return Response.json({ error: "이미 닫힌 주문입니다. 처음부터 다시 결제해 주세요." }, { status: 409 });
  // 돌아온 금액이 주문 금액과 다르면 승인 요청 자체를 보내지 않는다
  if (p.data.amount !== pay.amount) return Response.json({ error: "결제 금액이 주문과 다릅니다. 처음부터 다시 결제해 주세요." }, { status: 400 });

  const result = await confirmPayment(p.data, pay.amount);
  if (!result.ok) {
    if (result.retry) return Response.json({ ok: false, pending: true, error: result.message }, { status: 202 });
    await admin.from("payments").update({ status: "failed", raw: { code: result.code } }).eq("order_id", p.data.orderId).eq("status", "pending");
    return Response.json({ error: result.message }, { status: 402 });
  }

  // 토스 승인은 끝났다. 이용권 반영이 실패해도 같은 주문으로 다시 호출하면 이어서 반영된다(토스는 같은 결과를 돌려줌).
  let activated = false;
  for (let i = 0; i < 2 && !activated; i++) {
    const { error } = await admin.rpc("activate_subscription", { p_order: p.data.orderId, p_payment_key: p.data.paymentKey, p_raw: result.raw });
    if (error) console.error("[checkout:activate]", error.message);
    else activated = true;
  }
  if (!activated)
    return Response.json({ ok: false, pending: true, error: "결제는 승인되었지만 이용권 적용이 지연되고 있습니다. 이 화면을 새로고침하면 다시 반영합니다." }, { status: 202 });
  await logEvent(s.tenantId, s.user.id, "payment_completed", { plan: pay.plan_id, mode: pay.mode }, p.data.orderId);
  return Response.json({ ok: true });
}
