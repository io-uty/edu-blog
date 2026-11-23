import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { logEvent } from "./usage";

// 계좌이체(개인 계좌 직접 입금) 결제.
//  1) 주문을 만들고 사용자가 입금자명을 정한다(통장에 찍히는 이름)
//  2) 사용자가 안내된 계좌로 입금한다
//  3) 입금 알림이 들어오면(웹훅) 금액·입금자명이 정확히 맞는 주문 하나만 자동으로 이용권을 켠다.
//     애매하면(0건·2건 이상) 자동 처리하지 않고 운영자 화면에 남긴다 → 운영자가 "입금 확인" 버튼으로 처리
//
// 설정(서버 환경변수)
//   BANK_NAME / BANK_ACCOUNT / BANK_HOLDER  입금 받을 계좌(은행명·계좌번호·예금주)
//   DEPOSIT_WEBHOOK_SECRET                  입금 알림 웹훅 비밀값(24자 이상). 없으면 웹훅은 닫혀 있고 수동 확인만 가능

export interface BankConfig {
  bank: string;
  account: string;
  holder: string;
}

export function bankConfig(): BankConfig | null {
  const bank = (process.env.BANK_NAME ?? "").trim();
  const account = (process.env.BANK_ACCOUNT ?? "").trim();
  const holder = (process.env.BANK_HOLDER ?? "").trim();
  if (!bank || !holder || !/^[0-9][0-9-]{5,29}$/.test(account)) return null;
  return { bank, account, holder };
}

export const ORDER_HOURS = 72; // 주문 후 입금 가능 시간

/** 이름 비교용: 공백·기호·대소문자를 무시한다 */
export const normName = (s: string) => s.normalize("NFC").replace(/[\s\-_.·()[\]]/g, "").toLowerCase();

/** 주문의 입금자명과 입금 알림의 입금자명이 같은 사람인지. 은행이 긴 이름을 잘라 보내는 경우(앞부분 일치)는 4자 이상일 때만 허용 */
export function nameMatches(orderName: string, depositName: string): boolean {
  const a = normName(orderName);
  const b = normName(depositName);
  if (!a || !b) return false;
  return a === b || (b.length >= 4 && a.startsWith(b));
}

export interface Deposit {
  txId: string;
  amount: number;
  depositorName: string;
  occurredAt?: string | null;
  source?: string;
}
export type DepositResult = { status: "matched"; orderId: string } | { status: "unmatched" | "ambiguous" | "duplicate" | "invalid" };

/** 주문을 결제 완료로 바꾸고 이용권을 켠다(DB 함수가 한 트랜잭션으로 처리, 같은 주문은 한 번만 반영). */
export async function confirmOrder(orderId: string, by: string, txId: string): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  const { data: pay } = await db.from("payments").select("tenant_id, plan_id, status, provider").eq("order_id", orderId).maybeSingle();
  if (!pay || pay.provider !== "bank_transfer") return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (pay.status === "paid") return { ok: true, tenantId: pay.tenant_id };
  if (pay.status !== "pending") return { ok: false, error: "이미 닫힌 주문입니다." };
  const { error } = await db.rpc("activate_subscription", { p_order: orderId, p_payment_key: txId, p_raw: { method: "계좌이체", confirmedBy: by } });
  if (error) {
    console.error("[bank:activate]", error.message);
    return { ok: false, error: "생성권을 충전하지 못했습니다." };
  }
  await db.from("payments").update({ confirmed_by: by, deposit_tx_id: txId }).eq("order_id", orderId);
  await logEvent(pay.tenant_id, null, "payment_completed", { plan: pay.plan_id, method: "bank_transfer", auto: by.startsWith("auto:") }, orderId);
  return { ok: true, tenantId: pay.tenant_id };
}

/** 입금 알림 한 건을 처리한다. 같은 거래번호는 한 번만 처리한다. */
export async function processDeposit(d: Deposit): Promise<DepositResult> {
  if (!Number.isInteger(d.amount) || d.amount <= 0 || !d.depositorName.trim() || d.txId.length < 6) return { status: "invalid" };
  const db = supabaseAdmin();
  const ins = await db.from("deposit_events").insert({
    tx_id: d.txId,
    amount: d.amount,
    depositor_name: d.depositorName.trim().slice(0, 40),
    occurred_at: d.occurredAt ?? null,
    status: "unmatched",
    source: d.source ?? "webhook",
  });
  if (ins.error) {
    if (ins.error.code === "23505") return { status: "duplicate" };
    console.error("[bank:deposit]", ins.error.message);
    throw ins.error;
  }

  const { data: cands } = await db
    .from("payments")
    .select("order_id, depositor_name")
    .eq("provider", "bank_transfer")
    .eq("status", "pending")
    .eq("amount", d.amount)
    .not("depositor_name", "is", null)
    .gt("expires_at", new Date().toISOString());
  const hits = (cands ?? []).filter((c) => nameMatches(c.depositor_name as string, d.depositorName));
  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length > 1) {
    await db.from("deposit_events").update({ status: "ambiguous" }).eq("tx_id", d.txId);
    return { status: "ambiguous" };
  }
  const orderId = hits[0].order_id as string;
  const r = await confirmOrder(orderId, `auto:${d.txId}`, d.txId);
  if (!r.ok) return { status: "unmatched" };
  await db.from("deposit_events").update({ status: "matched", order_id: orderId }).eq("tx_id", d.txId);
  return { status: "matched", orderId };
}
