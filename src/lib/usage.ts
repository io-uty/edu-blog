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

type PlanRow = { id: string; name: string; is_trial: boolean; content_limit: number | null; image_limit: number | null };

/** 남은 생성권: 유효한 체험·구매 묶음의 한도를 모두 더하고, 가장 이른 시작 이후 사용량을 뺀다(DB consume_usage 와 같은 계산) */
export async function summary(tenantId: string): Promise<UsageSummary> {
  const admin = supabaseAdmin();
  const now = new Date();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("status, started_at, expires_at, plans(id, name, is_trial, content_limit, image_limit)")
    .eq("tenant_id", tenantId)
    .in("status", ["trial", "active"])
    .order("started_at", { ascending: false });
  const live = (subs ?? []).filter((s) => s.plans && (!s.expires_at || new Date(s.expires_at) > now));
  if (!live.length) {
    const last = subs?.[0];
    return { plan: null, status: last ? "expired" : null, expiresAt: last?.expires_at ?? null, content: { used: 0, limit: 0 }, image: { used: 0, limit: 0 } };
  }
  const plans = live.map((s) => s.plans as unknown as PlanRow);
  const since = live.map((s) => s.started_at).sort()[0];
  const { data: rows } = await admin.from("usage_ledger").select("usage_type, quantity").eq("tenant_id", tenantId).gte("created_at", since);
  const sum = (t: UsageType) => (rows ?? []).filter((r) => r.usage_type === t).reduce((a, r) => a + r.quantity, 0);
  const limit = (k: "content_limit" | "image_limit") => (plans.some((p) => p[k] === null) ? null : plans.reduce((a, p) => a + (p[k] ?? 0), 0));
  const paid = live.find((s) => !(s.plans as unknown as PlanRow).is_trial);
  const shown = (paid ?? live[0]).plans as unknown as PlanRow;
  return {
    plan: { id: shown.id, name: shown.name, isTrial: !paid },
    status: (paid ?? live[0]).status,
    expiresAt: (paid ?? live[0]).expires_at,
    content: { used: sum("content"), limit: limit("content_limit") },
    image: { used: sum("image"), limit: limit("image_limit") },
  };
}

/** 서버가 남기는 제품 이벤트(본문·개인정보는 넣지 않음) */
export async function logEvent(tenantId: string | null, userId: string | null, type: string, metadata: Record<string, string | number | boolean> = {}, dedupeKey?: string) {
  const { error } = await supabaseAdmin()
    .from("product_events")
    .insert({ tenant_id: tenantId, user_id: userId, event_type: type, metadata, dedupe_key: dedupeKey ?? null });
  if (error && error.code !== "23505") console.error("[event]", type, error.message);
}
