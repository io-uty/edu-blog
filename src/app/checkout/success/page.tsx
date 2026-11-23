"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";

type State = { s: "working" } | { s: "done" } | { s: "pending"; msg: string } | { s: "error"; msg: string };

// 토스 결제창에서 결제를 마치고 돌아오는 곳: paymentKey·orderId·amount 를 서버에 보내 승인(검증)한다.
export default function CheckoutSuccess() {
  const [st, setSt] = useState<State>({ s: "working" });
  const ran = useRef(false);
  const q = useRef<{ orderId: string; paymentKey: string; amount: number } | null>(null);

  async function confirm() {
    if (!q.current) return;
    setSt({ s: "working" });
    const r = await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q.current),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok && j?.ok) {
      setSt({ s: "done" });
      setTimeout(() => (window.location.href = "/#/compose"), 1800);
    } else if (r?.status === 202 || j?.pending) setSt({ s: "pending", msg: j?.error || "결제 확인이 지연되고 있습니다." });
    else if (r?.status === 401) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    else setSt({ s: "error", msg: j?.error || "결제를 확인하지 못했습니다." });
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const p = new URLSearchParams(window.location.search);
    const orderId = p.get("orderId") ?? "";
    const paymentKey = p.get("paymentKey") ?? "";
    const amount = Number(p.get("amount"));
    if (!orderId || !paymentKey || !Number.isInteger(amount)) return setSt({ s: "error", msg: "결제 정보를 확인할 수 없습니다." });
    q.current = { orderId, paymentKey, amount };
    confirm();
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        {st.s === "working" && (
          <>
            <Loader2 size={28} className="mx-auto mt-8 animate-spin text-brand" />
            <p className="mt-4 text-[16px] font-semibold">결제를 확인하고 있어요</p>
            <p className="mt-1 text-[13px] text-sub">잠시만 기다려 주세요. 창을 닫지 마세요.</p>
          </>
        )}
        {st.s === "done" && (
          <>
            <CheckCircle2 size={36} className="mx-auto mt-8 text-ok" />
            <p className="mt-4 text-[18px] font-bold">결제가 완료되었어요</p>
            <p className="mt-1 text-[13px] text-sub">생성권이 충전되었습니다. 곧 작성 화면으로 이동합니다.</p>
            <Link className="btn btn-primary mt-5 h-11 w-full" href="/#/compose">바로 글 쓰러 가기</Link>
          </>
        )}
        {st.s === "pending" && (
          <>
            <p className="mt-8 text-[16px] font-semibold">결제를 확인 중입니다</p>
            <p className="mt-1 text-[13px] leading-5 text-sub">{st.msg}</p>
            <button className="btn btn-primary mt-5 h-11 w-full" onClick={confirm}>다시 확인하기</button>
          </>
        )}
        {st.s === "error" && (
          <>
            <p className="mt-8 text-[16px] font-semibold text-err">결제를 완료하지 못했어요</p>
            <p className="mt-1 text-[13px] leading-5 text-sub">{st.msg}</p>
            <Link className="btn btn-primary mt-5 h-11 w-full" href="/#/compose">생성권 다시 선택하기</Link>
          </>
        )}
      </div>
    </div>
  );
}
