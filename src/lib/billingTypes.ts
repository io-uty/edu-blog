// 화면에서 쓰는 이용권·사용량 타입(서버 /api/usage 응답)
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
export const PAYWALL_MESSAGE =
  "무료 체험이 완료되었습니다. 계속해서 학원 맞춤형 블로그 콘텐츠를 제작하려면 이용권을 선택해 주세요.";

export const contentLeft = (u: UsageInfo | null) =>
  !u || !u.plan ? 0 : u.content.limit === null ? Infinity : Math.max(0, u.content.limit - u.content.used);
