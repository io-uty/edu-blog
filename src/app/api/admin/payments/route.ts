import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 운영자 전용: 입금 확인 대기 주문과, 주문에 연결되지 않은 입금 알림 */
export async function GET() {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  const db = supabaseAdmin();
  const [orders, deposits] = await Promise.all([
    db.from("payments").select("order_id, plan_id, amount, depositor_name, created_at, expires_at, tenants(name, branch_name)").eq("provider", "bank_transfer").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
    db.from("deposit_events").select("tx_id, amount, depositor_name, occurred_at, status, created_at").in("status", ["unmatched", "ambiguous"]).order("created_at", { ascending: false }).limit(100),
  ]);
  const now = Date.now();
  return Response.json({
    orders: (orders.data ?? []).map((o) => {
      const t = o.tenants as unknown as { name: string; branch_name: string | null } | null;
      return {
        orderId: o.order_id,
        plan: o.plan_id,
        amount: o.amount,
        depositorName: o.depositor_name,
        createdAt: o.created_at,
        expiresAt: o.expires_at,
        expired: !!o.expires_at && new Date(o.expires_at).getTime() < now,
        tenant: t ? [t.name, t.branch_name].filter(Boolean).join(" ") : "(삭제된 학원)",
      };
    }),
    deposits: deposits.data ?? [],
  });
}
