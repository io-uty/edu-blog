// 화면에서 쓰는 생성권·사용량 타입(서버 /api/usage 응답)
export interface UsageInfo {
  plan: { id: string; name: string; isTrial: boolean } | null;
  status: string | null;
  expiresAt: string | null;
  content: { used: number; limit: number | null };
  image: { used: number; limit: number | null };
}
export interface PlanInfo {
  id: string;
  name: string;
  price: number;
  content_limit: number | null;
  image_limit: number | null;
  period_days: number | null;
  features: { summary?: string; note?: string };
}
export interface PaymentInfo {
  available: boolean;
  test: boolean;
  method?: "bank" | "card";
}
export const PAYWALL_MESSAGE =
  "무료 체험이 끝났습니다. 생성권을 구매하면 학원 맞춤 블로그 글을 계속 만들 수 있습니다.";

export const contentLeft = (u: UsageInfo | null) =>
  !u || !u.plan ? 0 : u.content.limit === null ? Infinity : Math.max(0, u.content.limit - u.content.used);
