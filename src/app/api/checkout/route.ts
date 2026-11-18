import { randomUUID } from "node:crypto";
import { z } from "zod";
import { paymentProvider } from "@/lib/payments";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { logEvent } from "@/lib/usage";

/** 주문 생성: 금액은 서버의 요금제에서 정한다(클라이언트가 보낸 금액은 쓰지 않음). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return Response.json({ error: "학원 정보를 먼저 등록해 주세요." }, { status: 403 });
  if (s.role === "editor") return Response.json({ error: "이용권은 학원 관리자만 구매할 수 있습니다." }, { status: 403 });
  const p = z.object({ planId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "요금제를 확인해 주세요." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: plan } = await admin.from("plans").select("id, name, price").eq("id", p.data.planId).eq("active", true).eq("is_trial", false).maybeSingle();
  if (!plan) return Response.json({ error: "구매할 수 없는 요금제입니다." }, { status: 400 });

  const provider = paymentProvider();
  const orderId = `bb_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { error } = await admin.from("payments").insert({
    tenant_id: s.tenantId,
    plan_id: plan.id,
    provider: provider.id,
    mode: provider.mode,
    order_id: orderId,
    amount: plan.price,
    status: "pending",
  });
  if (error) {
    console.error("[checkout]", error.message);
    return Response.json({ error: "주문을 만들지 못했습니다." }, { status: 500 });
  }
  await logEvent(s.tenantId, s.user.id, "checkout_started", { plan: plan.id, mode: provider.mode }, orderId);
  return Response.json({ orderId, mode: provider.mode, checkoutUrl: `/checkout/${orderId}` });
}

/** 주문 조회(결제 화면 표시용) */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("order_id, amount, status, mode, tenant_id, plans(name, features)")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!data || data.tenant_id !== s.tenantId) return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ orderId: data.order_id, amount: data.amount, status: data.status, mode: data.mode, plan: data.plans });
}
