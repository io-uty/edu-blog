import "server-only";
import { supabaseAdmin } from "./supabase/server";

export type UsageType = "content" | "image";

/** 한도 안에서 사용량을 차감한다(같은 키로 다시 부르면 다시 차감하지 않음). DB 함수가 학원 단위로 잠그고 계산한다. */
export async function consume(tenantId: string, userId: string, type: UsageType, key: string, projectId: string | null = null) {
  const { data, error } = await supabaseAdmin().rpc("consume_usage", {
    p_tenant: tenantId,
    p_user: userId,
    p_type: type,
    p_qty: 1,
    p_project: projectId,
    p_key: key,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; used: number; usage_limit: number | null };
  return row;
}

/** 생성이 실패하면 차감을 되돌린다(같은 요청은 한 번만 환불). */
export async function refund(tenantId: string, userId: string, type: UsageType, key: string) {
  const { error } = await supabaseAdmin()
    .from("usage_ledger")
    .insert({ tenant_id: tenantId, user_id: userId, usage_type: type, quantity: -1, idempotency_key: `refund:${key}` });
  if (error && error.code !== "23505") console.error("[usage:refund]", error.message);
}

export interface UsageSummary {
  plan: { id: string; name: string; isTrial: boolean } | null;
  status: string | null;
  expiresAt: string | null;
  content: { used: number; limit: number | null };
  image: { used: number; limit: number | null };
}

/** 현재 이용권과 사용량(이용권 시작 이후 합계) */
export async function summary(tenantId: string): Promise<UsageSummary> {
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, started_at, expires_at, plans(id, name, is_trial, content_limit, image_limit)")
    .eq("tenant_id", tenantId)
    .in("status", ["trial", "active"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const plan = (sub?.plans ?? null) as unknown as { id: string; name: string; is_trial: boolean; content_limit: number | null; image_limit: number | null } | null;
  const expired = sub?.expires_at && new Date(sub.expires_at) < new Date();
  if (!sub || !plan || expired)
    return { plan: null, status: expired ? "expired" : null, expiresAt: sub?.expires_at ?? null, content: { used: 0, limit: 0 }, image: { used: 0, limit: 0 } };
  const { data: rows } = await admin
    .from("usage_ledger")
    .select("usage_type, quantity")
    .eq("tenant_id", tenantId)
    .gte("created_at", sub.started_at);
  const sum = (t: UsageType) => (rows ?? []).filter((r) => r.usage_type === t).reduce((a, r) => a + r.quantity, 0);
  return {
    plan: { id: plan.id, name: plan.name, isTrial: plan.is_trial },
    status: sub.status,
    expiresAt: sub.expires_at,
    content: { used: sum("content"), limit: plan.content_limit },
    image: { used: sum("image"), limit: plan.image_limit },
  };
}

/** 서버가 남기는 제품 이벤트(본문·개인정보는 넣지 않음) */
export async function logEvent(tenantId: string | null, userId: string, type: string, metadata: Record<string, string | number | boolean> = {}, dedupeKey?: string) {
  const { error } = await supabaseAdmin()
    .from("product_events")
    .insert({ tenant_id: tenantId, user_id: userId, event_type: type, metadata, dedupe_key: dedupeKey ?? null });
  if (error && error.code !== "23505") console.error("[event]", type, error.message);
}
