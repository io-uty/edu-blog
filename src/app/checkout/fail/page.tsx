"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

// 결제창에서 실패·취소하고 돌아오는 곳(쿼리: code, message, orderId)
const FRIENDLY: Record<string, string> = {
  PAY_PROCESS_CANCELED: "결제를 취소하셨어요.",
  PAY_PROCESS_ABORTED: "결제가 중단되었어요. 다시 시도해 주세요.",
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했어요. 다른 카드로 시도해 주세요.",
  INVALID_CARD_NUMBER: "카드 정보가 올바르지 않아요.",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "하루 결제 가능 횟수를 넘었어요.",
  EXCEED_MAX_PAYMENT_AMOUNT: "결제 한도를 넘었어요.",
};

export default function CheckoutFail() {
  const [info, setInfo] = useState({ code: "", orderId: "" });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setInfo({ code: p.get("code") ?? "", orderId: p.get("orderId") ?? "" });
  }, []);
  const canceled = info.code === "PAY_PROCESS_CANCELED";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        <p className={`mt-8 text-[17px] font-bold ${canceled ? "" : "text-err"}`}>{canceled ? "결제를 취소하셨어요" : "결제를 완료하지 못했어요"}</p>
        <p className="mt-1 text-[13px] leading-5 text-sub">{FRIENDLY[info.code] ?? "결제 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요. 결제된 금액은 없습니다."}</p>
        {info.orderId && <Link className="btn btn-primary mt-5 h-11 w-full" href={`/checkout/${encodeURIComponent(info.orderId)}`}>다시 결제하기</Link>}
        <Link className="btn mt-2 h-11 w-full" href="/#/compose">돌아가기</Link>
      </div>
    </div>
  );
}
