"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";

interface Order {
  orderId: string;
  amount: number;
  status: string;
  provider: "bank_transfer" | "toss";
  mode: "test" | "live";
  available: boolean;
  clientKey: string | null;
  customerKey: string;
  customerEmail: string | null;
  bank?: { bank: string; account: string; holder: string } | null;
  depositorName?: string | null;
  expiresAt?: string | null;
  expired?: boolean;
  orderName: string;
  plan: { name: string; features?: { summary?: string } } | null;
}

// 토스페이먼츠 결제창 v2: https://docs.tosspayments.com/sdk/v2/js
declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (o: { customerKey: string }) => {
        requestPayment: (o: Record<string, unknown>) => Promise<void>;
      };
    };
  }
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TossPayments) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v2/standard";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(s);
  });
}


function BankTransfer({ order, onChange }: { order: Order; onChange: (o: Partial<Order>) => void }) {
  const [name, setName] = useState(order.depositorName ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const router = useRouter();

  // 입금자명이 정해진 뒤에는 몇 초마다 입금 확인 상태를 살펴본다
  useEffect(() => {
    if (!order.depositorName || order.status !== "pending") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/checkout?orderId=${encodeURIComponent(order.orderId)}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json();
      if (j.status !== "pending") onChange({ status: j.status });
    }, 5000);
    return () => clearInterval(t);
  }, [order.depositorName, order.status, order.orderId, onChange]);

  async function save() {
    setSaving(true);
    setErr("");
    const r = await fetch("/api/checkout/depositor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId, depositorName: name }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setSaving(false);
    if (!r || !r.ok) return setErr(j?.error ?? "저장하지 못했습니다. 다시 시도해 주세요.");
    onChange({ depositorName: j.depositorName });
  }
  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  if (order.status === "paid")
    return (
      <div className="mt-6 space-y-3">
        <p className="flex items-center gap-2 rounded-2xl bg-bg2 px-4 py-3 text-[14px] font-semibold text-ok">
          <Check size={16} /> 입금이 확인되어 이용권이 활성화되었어요.
        </p>
        <button className="btn btn-primary h-11 w-full" onClick={() => router.push("/#/compose")}>글 만들러 가기</button>
      </div>
    );
  if (order.status !== "pending" || order.expired)
    return <p className="mt-6 text-[14px] text-sub">이 주문은 더 이상 입금할 수 없습니다. 이용권을 다시 선택해 주세요.</p>;

  if (!order.depositorName)
    return (
      <div className="mt-6 space-y-3">
        <label className="block text-[14px] font-semibold" htmlFor="dep">입금하실 분의 이름</label>
        <p className="text-xs leading-5 text-sub">이체할 때 상대 통장에 찍히는 이름과 똑같이 입력해 주세요(보통 보내는 분 이름). 이름과 금액이 맞으면 입금 확인 후 자동으로 이용권이 켜져요.</p>
        <input id="dep" className="field h-11 w-full" value={name} maxLength={20} placeholder="예: 홍길동" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && !saving && save()} />
        <button className="btn btn-primary h-11 w-full" disabled={saving || name.trim().length < 2} onClick={save}>
          {saving && <Loader2 size={15} className="animate-spin" />} 입금 계좌 확인하기
        </button>
        <Link className="btn h-11 w-full" href="/#/compose">취소하고 돌아가기</Link>
        {err && <p className="text-[14px] text-err">{err}</p>}
      </div>
    );

  const rows: [string, string, boolean][] = order.bank
    ? [["은행", order.bank.bank, false], ["계좌번호", order.bank.account, true], ["예금주", order.bank.holder, false], ["입금액", `${order.amount.toLocaleString()}원`, false], ["입금자명", order.depositorName, false]]
    : [];
  const until = order.expiresAt ? new Date(order.expiresAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return (
    <div className="mt-6 space-y-3">
      <p className="text-[14px] font-semibold">아래 계좌로 입금해 주세요</p>
      <dl className="divide-y divide-line rounded-2xl border border-line text-[14px]">
        {rows.map(([k, v, canCopy]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-sub">{k}</dt>
            <dd className="flex items-center gap-2 font-semibold">
              {v}
              {canCopy && (
                <button className="btn h-7 px-2 text-xs" onClick={() => copy(k, v.replace(/-/g, ""))} aria-label="계좌번호 복사">
                  {copied === k ? <Check size={13} /> : <Copy size={13} />} {copied === k ? "복사됨" : "복사"}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center gap-2 rounded-2xl bg-bg2 px-4 py-3 text-[13px] leading-5">
        <Loader2 size={14} className="shrink-0 animate-spin" /> 입금을 확인하는 중이에요. 입금하시면 이 화면이 자동으로 바뀝니다.
      </p>
      <ul className="space-y-1 text-xs leading-5 text-sub">
        <li>· 입금액은 {order.amount.toLocaleString()}원 그대로, 입금자명은 위 이름과 같게 보내 주세요.</li>
        {until && <li>· {until}까지 입금해 주세요. 지나면 주문이 만료됩니다.</li>}
        <li>· 확인이 오래 걸리면 운영자가 입금을 직접 확인해 이용권을 켜 드려요.</li>
      </ul>
      <Link className="btn h-11 w-full" href="/#/compose">나중에 하기</Link>
    </div>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    fetch(`/api/checkout?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(`/checkout/${orderId}`)}`;
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setOrder(j);
      })
      .catch((e) => setErr(e.message || "주문을 불러오지 못했습니다."));
  }, [orderId]);

  async function pay() {
    if (!order || !order.clientKey || started.current) return;
    started.current = true;
    setBusy(true);
    setErr("");
    try {
      await loadSdk();
      const toss = window.TossPayments!(order.clientKey);
      const payment = toss.payment({ customerKey: order.customerKey });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        ...(order.customerEmail ? { customerEmail: order.customerEmail } : {}),
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우 등: 다시 시도할 수 있게 되돌린다
      const code = (e as { code?: string })?.code;
      setErr(code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED" ? "결제를 취소하셨어요. 준비되면 다시 눌러 주세요." : "결제창을 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      started.current = false;
      setBusy(false);
    }
  }

  const payable = order && order.status === "pending" && order.available;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-8 shadow-sm">
        <Logo />
        {!order && !err && (
          <p className="mt-6 flex items-center gap-2 text-sub">
            <Loader2 size={16} className="animate-spin" /> 주문을 불러오는 중…
          </p>
        )}
        {order && (
          <>
            <h1 className="mt-6 text-[20px] font-bold">{order.plan?.name ?? "이용권"} {order.provider === "bank_transfer" ? "구매" : "결제"}</h1>
            {order.plan?.features?.summary && <p className="mt-1 text-[14px] text-sub">{order.plan.features.summary}</p>}
            <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-bg2 px-5 py-4">
              <span className="text-[14px] text-sub">{order.provider === "bank_transfer" ? "입금 금액" : "결제 금액"}</span>
              <span className="text-[24px] font-extrabold">{order.amount.toLocaleString()}원</span>
            </div>
            <p className="mt-2 text-xs text-sub">주문번호 {order.orderId}</p>

            {order.provider === "bank_transfer" ? (
              !order.available ? <p className="mt-6 text-[14px] text-sub">결제 준비 중입니다. 잠시 뒤 다시 시도해 주세요.</p> : <BankTransfer order={order} onChange={(o) => setOrder((prev) => (prev ? { ...prev, ...o } : prev))} />
            ) : order.status === "paid" ? (
              <Link className="btn btn-primary mt-6 h-11 w-full" href="/#/compose">이미 결제된 주문입니다 · 돌아가기</Link>
            ) : order.status !== "pending" ? (
              <p className="mt-6 text-[14px] text-sub">이 주문은 더 이상 결제할 수 없습니다. 이용권을 다시 선택해 주세요.</p>
            ) : !order.available ? (
              <p className="mt-6 text-[14px] text-sub">결제 준비 중입니다. 잠시 뒤 다시 시도해 주세요.</p>
            ) : (
              <div className="mt-6 space-y-2">
                <button className="btn btn-primary h-11 w-full text-[15px]" disabled={busy || !payable} onClick={pay}>
                  {busy && <Loader2 size={15} className="animate-spin" />} {order.amount.toLocaleString()}원 결제하기
                </button>
                <Link className="btn h-11 w-full" href="/#/compose">취소하고 돌아가기</Link>
                {/* 테스트 키로 연결된 경우에만 보이는 안내(실결제 키로 바꾸면 자동으로 사라집니다) */}
                {order.mode === "test" && <p className="pt-1 text-center text-xs text-sub">결제 테스트 중입니다. 실제로 결제되지 않습니다.</p>}
              </div>
            )}
          </>
        )}
        {err && <p className="mt-4 text-[14px] text-err">{err}</p>}
        {order?.provider === "toss" && <p className="mt-6 text-center text-xs text-sub">결제는 토스페이먼츠를 통해 안전하게 처리됩니다.</p>}
      </div>
    </div>
  );
}
