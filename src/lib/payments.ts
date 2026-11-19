import "server-only";

// 결제: 토스페이먼츠(결제창 v2). 흐름
//   1) 서버가 주문을 만든다(금액은 서버의 요금제 기준)
//   2) 브라우저가 토스 결제창을 연다(클라이언트 키)
//   3) 결제 성공 후 돌아오면 서버가 시크릿 키로 승인 API 를 호출해 금액·주문번호를 검증한다
//   4) 검증을 통과한 주문만 이용권을 활성화한다(가짜 승인 경로 없음)
//
// 설정(서버 환경변수)
//   TOSS_CLIENT_KEY  test_ck_… / live_ck_…  (결제창 API 개별 연동 키)
//   TOSS_SECRET_KEY  test_sk_… / live_sk_…
// 두 키의 환경(test/live)이 같아야 한다. test 키는 실제 결제가 일어나지 않는다.

export type PayMode = "test" | "live";

export interface PaymentConfig {
  provider: "toss";
  mode: PayMode;
  clientKey: string;
}

/** 키가 올바르게 설정되어 있을 때만 결제를 연다. 설정이 없거나 잘못되면 null(결제 준비 중). */
export function paymentConfig(): PaymentConfig | null {
  const ck = (process.env.TOSS_CLIENT_KEY ?? "").trim();
  const sk = (process.env.TOSS_SECRET_KEY ?? "").trim();
  const m = /^(test|live)_sk_/.exec(sk);
  const c = /^(test|live)_ck_/.exec(ck);
  if (!m || !c || m[1] !== c[1]) return null;
  return { provider: "toss", mode: m[1] as PayMode, clientKey: ck };
}

// 개발 환경에서만 모의 서버로 바꿔 끼울 수 있다(운영에서는 항상 실제 토스 주소)
const API_BASE = process.env.NODE_ENV !== "production" && process.env.TOSS_API_BASE ? process.env.TOSS_API_BASE : "https://api.tosspayments.com";

export interface ConfirmInput {
  orderId: string;
  paymentKey: string;
}

export type ConfirmResult =
  | { ok: true; raw: Record<string, unknown> }
  /** retry=true: 결제가 되었는지 아직 모르는 상태(네트워크·서버 오류). 주문을 실패로 닫지 말고 다시 확인해야 한다. */
  | { ok: false; retry: boolean; code: string; message: string };

const CONFIG_ERRORS = new Set(["UNAUTHORIZED_KEY", "INVALID_API_KEY", "FORBIDDEN_REQUEST"]);

// 토스 오류 코드 → 사용자 안내(개발자용 메시지를 그대로 보여주지 않는다)
const FRIENDLY: Record<string, string> = {
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했습니다. 다른 카드로 다시 시도해 주세요.",
  EXCEED_MAX_CARD_INSTALLMENT_PLAN: "선택한 할부 개월 수를 사용할 수 없습니다.",
  INVALID_CARD_NUMBER: "카드 정보가 올바르지 않습니다.",
  NOT_FOUND_PAYMENT_SESSION: "결제 시간이 지났습니다. 처음부터 다시 결제해 주세요.",
  NOT_FOUND_PAYMENT: "결제 정보를 찾지 못했습니다. 처음부터 다시 결제해 주세요.",
  ALREADY_PROCESSED_PAYMENT: "이미 처리된 결제입니다.",
  UNAUTHORIZED_KEY: "결제 설정에 문제가 있어 확인이 지연되고 있습니다. 관리자에게 문의해 주세요.",
  INVALID_API_KEY: "결제 설정에 문제가 있어 확인이 지연되고 있습니다. 관리자에게 문의해 주세요.",
  FORBIDDEN_REQUEST: "결제 설정에 문제가 있어 확인이 지연되고 있습니다. 관리자에게 문의해 주세요.",
};

/** 토스 서버에 승인을 요청하고 결과를 검증한다. 금액은 서버에 저장된 주문 금액만 사용한다. */
export async function confirmPayment(input: ConfirmInput, expectedAmount: number): Promise<ConfirmResult> {
  const sk = (process.env.TOSS_SECRET_KEY ?? "").trim();
  if (!paymentConfig()) return { ok: false, retry: false, code: "NOT_CONFIGURED", message: "결제 준비 중입니다." };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sk}:`).toString("base64"),
        "Content-Type": "application/json",
        // 같은 주문을 다시 승인 요청해도 중복 결제되지 않고 처음 결과가 돌아온다
        "Idempotency-Key": input.orderId,
      },
      body: JSON.stringify({ paymentKey: input.paymentKey, orderId: input.orderId, amount: expectedAmount }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, retry: true, code: "NETWORK", message: "결제 확인이 지연되고 있습니다. 잠시 뒤 다시 확인해 주세요." };
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(body.code ?? res.status);
    // 결과를 모르는 상태(서버 오류·처리 중)나 우리 쪽 키 설정 문제는 주문을 실패로 닫지 않는다(고친 뒤 이어서 확인 가능)
    const configProblem = CONFIG_ERRORS.has(code);
    const retry = res.status >= 500 || code === "IDEMPOTENT_REQUEST_PROCESSING" || code === "PROVIDER_ERROR" || configProblem;
    console.error("[payments:confirm]", res.status, code, String(body.message ?? "").slice(0, 200));
    return {
      ok: false,
      retry,
      code,
      message: configProblem ? FRIENDLY[code] : retry ? "결제 확인이 지연되고 있습니다. 잠시 뒤 다시 확인해 주세요." : (FRIENDLY[code] ?? "결제를 완료하지 못했습니다. 다시 시도해 주세요."),
    };
  }

  // 응답이 우리 주문과 정확히 일치하는지 확인한다
  const receipt = (body.receipt ?? {}) as { url?: string };
  const okAll = body.status === "DONE" && body.orderId === input.orderId && Number(body.totalAmount) === expectedAmount;
  if (!okAll) {
    console.error("[payments:confirm] 응답 불일치", body.status, body.orderId, body.totalAmount);
    return { ok: false, retry: false, code: "MISMATCH", message: "결제 내용이 주문과 일치하지 않아 반영하지 않았습니다. 문제가 계속되면 문의해 주세요." };
  }
  // 저장은 필요한 최소 정보만(카드번호 등은 저장하지 않는다)
  return {
    ok: true,
    raw: { method: body.method ?? null, approvedAt: body.approvedAt ?? null, receiptUrl: receipt.url ?? null, totalAmount: body.totalAmount },
  };
}
