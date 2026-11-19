import { requireAdmin } from "@/lib/adminAuth";
import { buildStats } from "@/lib/adminStats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 운영자 전용 전체 통계. platform_admins 에 등록된 계정만 볼 수 있다. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (!a.ok) return a.res;
  const d = new URL(req.url).searchParams.get("days");
  const days = d === "all" ? null : Math.min(365, Math.max(1, Number(d) || 30));
  try {
    return Response.json(await buildStats(days));
  } catch (e) {
    console.error("[admin:stats]", e);
    return Response.json({ error: "통계를 계산하지 못했습니다." }, { status: 500 });
  }
}
