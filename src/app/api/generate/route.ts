import { z } from "zod";
import { assemble } from "@/lib/assemble";
import { IS_MOCK, MODEL, toUserMessage } from "@/lib/llm";
import { runBrief, runDraft, runPolish, type StageName } from "@/lib/pipeline";
import { checkQuality } from "@/lib/quality";
import { renderHtml, renderPlainText } from "@/lib/render";
import { verticalOf } from "@/lib/prompt/verticals";
import { getCtx } from "@/lib/requestCtx";
import { docToRow } from "@/lib/tenantDb";
import { consume, logEvent, refund } from "@/lib/usage";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { displayName } from "@/lib/tenant";
import { AnalysisSchema, PlanSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  topic: z.string().trim().min(2).max(200),
  contentType: z.string().trim().min(1).max(40),
  memo: z.string().trim().max(500).optional(),
  resume: z.object({ analysis: AnalysisSchema.optional(), plan: PlanSchema.optional() }).optional(),
  regionIndex: z.number().int().min(0).nullable().optional(),
  brand: z.unknown().optional(),
  tenant: z.unknown().optional(),
  recent: z.unknown().optional(),
});

// NDJSON 스트림으로 단계별 진행 상태를 내려준다.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "주제(2~200자)와 콘텐츠 유형을 확인해 주세요." }, { status: 400 });
  const got = await getCtx(parsed.data, { recent: true });
  if (!got.ok) return got.res;
  const { ctx, session } = got;

  // 사용량: 서버에서만 계산·차감한다. 실패하면 아래에서 되돌린다.
  let chargedKey: string | null = null;
  if (session?.tenantId && !IS_MOCK) {
    // 키는 서버가 만든다: 클라이언트 키를 쓰면 같은 키 재전송이 "이미 차감됨"으로 통과해 한도 없이 생성된다
    const key = `gen:${randomUUID()}`;
    try {
      const r = await consume(session.tenantId, session.user.id, "content", key);
      if (!r.allowed)
        return Response.json(
          {
            code: "QUOTA_EXCEEDED",
            error: "무료 체험(또는 생성권)을 모두 사용했습니다. 생성권을 구매하면 계속 만들 수 있습니다.",
            used: r.used,
            limit: r.usage_limit,
          },
          { status: 402 },
        );
      chargedKey = key;
      await logEvent(session.tenantId, session.user.id, "content_generation_started", { type: parsed.data.contentType }, key);
    } catch (e) {
      console.error("[generate:usage]", e);
      return Response.json({ error: "사용량을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
    }
  }
  const input = { ...parsed.data, ctx };
  const brand = ctx.brand;
  // 인사말·마무리 소제목의 {학원명}이 비지 않게 학원 이름으로 채운다
  const settings = { ...DEFAULT_SETTINGS, brand: { ...brand, name: brand.name.trim() || displayName(ctx.tenant) } };
  const vertical = verticalOf(ctx.tenant.academyType);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let stage: StageName = "analysis";
      try {
        send({ type: "meta", mock: IS_MOCK, model: IS_MOCK ? null : MODEL });

        // 분석과 기획은 한 번의 호출로 만든다(화면 단계 표시는 그대로 둘로 보낸다)
        let { analysis, plan } = input.resume ?? {};
        if (!analysis || !plan) {
          send({ type: "stage", stage, status: "running" });
          ({ analysis, plan } = await runBrief(input, vertical.factSensitiveTypes.includes(input.contentType)));
        }
        send({ type: "stage", stage, status: "done", data: analysis });
        stage = "plan";
        send({ type: "stage", stage, status: "done", data: plan });

        stage = "draft";
        send({ type: "stage", stage, status: "running" });
        const written = await runDraft(input, analysis, plan);
        // AI 티 윤문: 실패해도 생성은 끝까지 간다(윤문 전 원고 사용)
        const raw = await runPolish(input, written).catch((e) => {
          console.warn("[generate:polish]", String(e).slice(0, 200));
          return written;
        });
        // 제목 지역 표기·고정/지역 태그는 코드가 조립(AI 생성 아님)
        const { draft, regionIndex } = assemble(raw, input.topic, input.regionIndex, brand);
        send({ type: "stage", stage, status: "done" });

        const quality = checkQuality(draft, brand, ctx.tenant.prohibited);
        if (
          vertical.factSensitiveTypes.includes(input.contentType) &&
          (analysis.facts_needed.length > 0 || !analysis.can_write_without_sources)
        ) {
          quality.issues.unshift({
            code: "SOURCES_REQUIRED",
            severity: "warning",
            message: `공식 근거 자료가 필요한 주제입니다. 참고 자료 업로드(Phase 2) 전까지 해당 사실은 본문에서 제외했습니다: ${analysis.facts_needed.join(", ") || "입시 사실 전반"}`,
          });
        }

        // 로그인 사용 시 생성 결과를 바로 학원 콘텐츠로 저장한다(저장 실패해도 결과는 보낸다)
        let projectId: string | null = null;
        if (session?.tenantId) {
          const { data, error } = await session.db
            .from("projects")
            .insert(
              docToRow(
                { title: draft.title, topic: input.topic, contentType: input.contentType, mock: IS_MOCK, plan, regionIndex, draft, images: [] },
                session.tenantId,
                session.user.id,
              ),
            )
            .select("id")
            .single();
          if (error) console.error("[generate:save]", error.message);
          else projectId = data.id;
        }

        if (session?.tenantId && chargedKey)
          await logEvent(session.tenantId, session.user.id, "content_generation_completed", { type: input.contentType }, chargedKey);

        send({
          type: "result",
          projectId,
          mock: IS_MOCK,
          draft,
          plan,
          regionIndex,
          plainText: renderPlainText(draft, settings),
          html: renderHtml(draft, settings),
          quality,
        });
      } catch (e) {
        console.error(`[generate:${stage}]`, e);
        if (session?.tenantId && chargedKey) await refund(session.tenantId, session.user.id, "content", chargedKey);
        send({ type: "error", stage, message: toUserMessage(e) });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
