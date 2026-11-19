import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ORDER_HOURS, bankConfig } from "@/lib/bank";
import { paymentConfig } from "@/lib/payments";
import { getSession, supabaseAdmin, UNAUTHORIZED } from "@/lib/supabase/server";
import { logEvent } from "@/lib/usage";

/** 어떤 결제 방식을 쓰는지: 입금 계좌가 설정돼 있으면 계좌이체, 아니면 토스 카드결제, 둘 다 없으면 준비 중 */
function activeMethod(): { provider: "bank_transfer" | "toss"; mode: "test" | "live" } | null {
  if (bankConfig()) return { provider: "bank_transfer", mode: "live" };
  const t = paymentConfig();
  return t ? { provider: "toss", mode: t.mode } : null;
}

/** 주문 생성: 금액은 서버의 요금제에서 정한다(클라이언트가 보낸 금액은 쓰지 않음). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  if (!s.tenantId) return Response.json({ error: "학원 정보를 먼저 등록해 주세요." }, { status: 403 });
  if (s.role === "editor") return Response.json({ error: "이용권은 학원 관리자만 구매할 수 있습니다." }, { status: 403 });
  const method = activeMethod();
  if (!method) return Response.json({ code: "PAYMENT_UNAVAILABLE", error: "결제 준비 중입니다. 잠시 뒤 다시 시도해 주세요." }, { status: 503 });
  const p = z.object({ planId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "요금제를 확인해 주세요." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: plan } = await admin.from("plans").select("id, name, price").eq("id", p.data.planId).eq("active", true).eq("is_trial", false).maybeSingle();
  if (!plan) return Response.json({ error: "구매할 수 없는 요금제입니다." }, { status: 400 });

  // 아직 유효한 같은 요금제의 결제 전 주문이 있으면 새로 만들지 않고 이어서 쓴다
  const { data: open } = await admin
    .from("payments")
    .select("order_id, amount, expires_at, created_at")
    .eq("tenant_id", s.tenantId)
    .eq("plan_id", plan.id)
    .eq("status", "pending")
    .eq("provider", method.provider)
    .eq("mode", method.mode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stillValid = open && open.amount === plan.price && (open.expires_at ? new Date(open.expires_at) > new Date() : Date.now() - new Date(open.created_at).getTime() < 30 * 60_000);
  if (open && stillValid) return Response.json({ orderId: open.order_id, checkoutUrl: `/checkout/${open.order_id}` });

  const orderId = `bb_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const { error } = await admin.from("payments").insert({
    tenant_id: s.tenantId,
    plan_id: plan.id,
    provider: method.provider,
    mode: method.mode,
    order_id: orderId,
    amount: plan.price,
    status: "pending",
    ...(method.provider === "bank_transfer" ? { expires_at: new Date(Date.now() + ORDER_HOURS * 3600_000).toISOString() } : {}),
  });
  if (error) {
    console.error("[checkout]", error.message);
    return Response.json({ error: "주문을 만들지 못했습니다." }, { status: 500 });
  }
  await logEvent(s.tenantId, s.user.id, "checkout_started", { plan: plan.id, method: method.provider }, orderId);
  return Response.json({ orderId, checkoutUrl: `/checkout/${orderId}` });
}

/** 주문 조회(결제 화면용). 입금 계좌는 이 주문의 소유 학원에게만 보여준다. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return UNAUTHORIZED();
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("order_id, amount, status, mode, provider, tenant_id, depositor_name, expires_at, plans(name, features)")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!data || data.tenant_id !== s.tenantId) return Response.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  const plan = data.plans as unknown as { name: string; features?: { summary?: string } } | null;
  const base = { orderId: data.order_id, amount: data.amount, status: data.status, provider: data.provider, plan, orderName: `bbolog ${plan?.name ?? "이용권"}` };

  if (data.provider === "bank_transfer") {
    const bank = bankConfig();
    const expired = !!data.expires_at && new Date(data.expires_at) < new Date();
    return Response.json({
      ...base,
      mode: "live",
      available: !!bank,
      bank: bank && data.status === "pending" ? bank : null,
      depositorName: data.depositor_name,
      expiresAt: data.expires_at,
      expired,
    });
  }
  const cfg = paymentConfig();
  return Response.json({
    ...base,
    mode: cfg?.mode ?? data.mode,
    available: !!cfg && cfg.mode === data.mode,
    clientKey: cfg?.clientKey ?? null, // 클라이언트 키는 공개용 키
    customerKey: s.user.id,
    customerEmail: s.user.email ?? null,
  });
}
