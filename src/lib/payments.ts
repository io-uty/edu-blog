import "server-only";

// 결제 모듈. 실제 PG(예: 토스페이먼츠) 계약·키가 없으면 테스트 모드로만 동작한다.
// 실결제 연동 시 이 인터페이스를 구현한 PG 모듈을 추가하고 PAYMENT_PROVIDER 로 고른다.

export interface ConfirmInput {
  orderId: string;
  paymentKey: string;
  amount: number;
}
export interface ConfirmResult {
  ok: boolean;
  raw: Record<string, unknown>;
  message?: string;
}
export interface PaymentProvider {
  id: string;
  mode: "test" | "live";
  /** PG 서버에 승인을 요청하고 결과를 검증한다(금액·주문번호 일치). */
  confirm(input: ConfirmInput, expectedAmount: number): Promise<ConfirmResult>;
}

/** 테스트 결제: 실제 돈이 오가지 않는다. 서버에 저장된 주문 금액과 요청 금액이 같을 때만 승인한다. */
const testProvider: PaymentProvider = {
  id: "test",
  mode: "test",
  async confirm(input, expectedAmount) {
    if (input.amount !== expectedAmount) return { ok: false, raw: {}, message: "결제 금액이 주문과 다릅니다." };
    if (!input.paymentKey.startsWith("test_")) return { ok: false, raw: {}, message: "테스트 결제 키가 아닙니다." };
    return { ok: true, raw: { provider: "test", approvedAt: new Date().toISOString() } };
  },
};

export function paymentProvider(): PaymentProvider {
  // 실 PG 모듈이 추가되기 전까지는 항상 테스트 모드
  return testProvider;
}
