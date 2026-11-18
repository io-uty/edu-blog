import { IS_MOCK, MODEL, pingApi } from "@/lib/llm";

export const dynamic = "force-dynamic";

// ?check=1 이면 실제로 API를 호출해 키 유효성까지 확인한다.
export async function GET(req: Request) {
  const base = { mock: IS_MOCK, model: IS_MOCK ? null : MODEL, illustration: !!process.env.OPENAI_API_KEY };
  if (new URL(req.url).searchParams.get("check") === "1") {
    const r = await pingApi();
    return Response.json({ ...base, ...r });
  }
  return Response.json(base);
}
