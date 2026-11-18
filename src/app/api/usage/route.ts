import { SUPABASE_ENABLED, getSession, supabaseAdmin } from "@/lib/supabase/server";
import { summary } from "@/lib/usage";

export const dynamic = "force-dynamic";

/** 내 학원의 이용권·사용량과 구매할 수 있는 요금제 */
export async function GET() {
  if (!SUPABASE_ENABLED) return Response.json({ mode: "local" });
  const s = await getSession();
  if (!s) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!s.tenantId) return Response.json({ mode: "cloud", usage: null, plans: [] });
  const [usage, plans] = await Promise.all([
    summary(s.tenantId),
    supabaseAdmin().from("plans").select("id, name, price, content_limit, image_limit, period_days, features").eq("active", true).eq("is_trial", false).order("price"),
  ]);
  return Response.json({ mode: "cloud", usage, plans: plans.data ?? [] });
}
