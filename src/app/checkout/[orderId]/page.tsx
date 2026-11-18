"use client";

import { use, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import Logo from "@/components/Logo";

interface Order {
  orderId: string;
  amount: number;
  status: string;
  mode: "test" | "live";
  plan: { name: string; features?: { summary?: string } } | null;
}

// 테스트 결제 화면. 실제 PG 연동 전까지 결제 흐름(주문 → 승인 → 서버 검증 → 이용권 활성화)을 확인하는 용도.
export default function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/checkout?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setOrder(j);
      })
      .catch((e) => setErr(e.message || "주문을 불러오지 못했습니다."));
  }, [orderId]);

  async function approve() {
    if (!order) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, paymentKey: `test_${crypto.randomUUID()}`, amount: order.amount }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setBusy(false);
      return setErr(j?.error || "결제를 완료하지 못했습니다.");
    }
    window.location.href = "/#/compose";
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-8 shadow-sm">
        <Logo />
        <p className="mt-6 inline-block rounded-full bg-[#fff7e0] px-3 py-1 text-xs font-semibold text-warn">테스트 결제 · 실제로 돈이 나가지 않습니다</p>
        {!order && !err && (
          <p className="mt-6 flex items-center gap-2 text-sub">
            <Loader2 size={16} className="animate-spin" /> 주문을 불러오는 중…
          </p>
        )}
        {order && (
          <>
            <h1 className="mt-4 text-[20px] font-bold">{order.plan?.name ?? "이용권"} 결제</h1>
            {order.plan?.features?.summary && <p className="mt-1 text-[14px] text-sub">{order.plan.features.summary}</p>}
            <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-bg2 px-5 py-4">
              <span className="text-[14px] text-sub">결제 금액</span>
              <span className="text-[24px] font-extrabold">{order.amount.toLocaleString()}원</span>
            </div>
            <p className="mt-2 text-xs text-sub">주문번호 {order.orderId}</p>
            {order.status === "paid" ? (
              <Link className="btn btn-primary mt-6 h-11 w-full" href="/#/compose">이미 결제된 주문입니다 · 돌아가기</Link>
            ) : (
              <div className="mt-6 space-y-2">
                <button className="btn btn-primary h-11 w-full" disabled={busy || order.status !== "pending"} onClick={approve}>
                  {busy && <Loader2 size={15} className="animate-spin" />} 테스트 결제 승인
                </button>
                <Link className="btn h-11 w-full" href="/#/compose">취소하고 돌아가기</Link>
              </div>
            )}
          </>
        )}
        {err && <p className="mt-4 text-[14px] text-err">{err}</p>}
      </div>
    </div>
  );
}
