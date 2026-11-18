"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { PAYWALL_MESSAGE, type PlanInfo, type UsageInfo } from "@/lib/billingTypes";

/** 무료 체험(또는 이용권) 한도를 다 쓰면 작성 화면 대신 보여주는 안내 */
export default function Paywall({
  usage,
  plans,
  onBuy,
  onSeen,
}: {
  usage: UsageInfo | null;
  plans: PlanInfo[];
  onBuy: (planId: string) => Promise<void>;
  onSeen: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      onSeen();
    }
  }, [onSeen]);
  const trialDone = !usage?.plan || usage.plan.isTrial;

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-[720px] rounded-3xl border border-line bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Sparkles size={24} />
        </div>
        <h2 className="mt-4 text-[22px] font-bold leading-snug">
          {trialDone ? "무료 체험을 모두 사용했어요" : "이번 달 이용 횟수를 모두 사용했어요"}
        </h2>
        <p className="mt-2 text-[15px] leading-7 text-sub">
          {trialDone ? PAYWALL_MESSAGE : "계속 제작하려면 이용권을 다시 선택해 주세요."}
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-col rounded-2xl border border-line p-5">
              <p className="text-[17px] font-bold">{p.name}</p>
              <p className="mt-1 text-[24px] font-extrabold">
                {p.price.toLocaleString()}원<span className="text-[14px] font-medium text-sub"> / {p.period_days ?? 30}일</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5 text-[14px]">
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-ok" /> 블로그 글 {p.content_limit === null ? "무제한" : `${p.content_limit}편`}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-ok" /> 이미지 {p.image_limit === null ? "무제한" : `${p.image_limit}장`}
                </li>
                <li className="flex items-center gap-2">
                  <Check size={15} className="text-ok" /> 학원 맞춤 문체·브랜드 적용
                </li>
              </ul>
              <button
                className="btn btn-primary mt-4 w-full"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(p.id);
                  try {
                    await onBuy(p.id);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === p.id && <Loader2 size={15} className="animate-spin" />} 이용권 구매
              </button>
            </li>
          ))}
        </ul>
        {plans.length === 0 && <p className="mt-6 text-[14px] text-sub">구매할 수 있는 이용권이 아직 없습니다. 관리자에게 문의해 주세요.</p>}
        <p className="mt-5 text-xs leading-5 text-sub">
          지금까지 만든 글은 그대로 보고 편집·다운로드할 수 있어요. 현재 결제는 <b>테스트 모드</b>라 실제 돈이 나가지 않습니다.
        </p>
      </div>
    </div>
  );
}
