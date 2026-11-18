import { z } from "zod";
import { CONTENT_TYPES, FACT_SENSITIVE_TYPES, type ContentType } from "@/config/brand";
import { assemble } from "@/lib/assemble";
import { IS_MOCK, MODEL, toUserMessage } from "@/lib/llm";
import { runAnalysis, runDraft, runPlan, type StageName } from "@/lib/pipeline";
import { checkQuality } from "@/lib/quality";
import { renderHtml, renderPlainText } from "@/lib/render";
import { AnalysisSchema, PlanSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  topic: z.string().trim().min(2).max(200),
  contentType: z.enum(CONTENT_TYPES),
  resume: z.object({ analysis: AnalysisSchema.optional(), plan: PlanSchema.optional() }).optional(),
  regionIndex: z.number().int().min(0).nullable().optional(),
});

// NDJSON 스트림으로 단계별 진행 상태를 내려준다.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "주제(2~200자)와 콘텐츠 유형을 확인해 주세요." }, { status: 400 });
  const input = parsed.data;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let stage: StageName = "analysis";
      try {
        send({ type: "meta", mock: IS_MOCK, model: IS_MOCK ? null : MODEL });

        let analysis = input.resume?.analysis;
        if (!analysis) {
          send({ type: "stage", stage, status: "running" });
          analysis = await runAnalysis(input);
        }
        send({ type: "stage", stage, status: "done", data: analysis });

        stage = "plan";
        let plan = input.resume?.plan;
        if (!plan) {
          send({ type: "stage", stage, status: "running" });
          plan = await runPlan(input, analysis);
        }
        send({ type: "stage", stage, status: "done", data: plan });

        stage = "draft";
        send({ type: "stage", stage, status: "running" });
        const raw = await runDraft(input, analysis, plan);
        // 제목 지역 표기·고정/지역 태그는 코드가 조립(AI 생성 아님)
        const { draft, regionIndex } = assemble(raw, input.topic, input.regionIndex);
        send({ type: "stage", stage, status: "done" });

        const quality = checkQuality(draft);
        if (
          FACT_SENSITIVE_TYPES.includes(input.contentType as ContentType) &&
          (analysis.facts_needed.length > 0 || !analysis.can_write_without_sources)
        ) {
          quality.issues.unshift({
            code: "SOURCES_REQUIRED",
            severity: "warning",
            message: `공식 근거 자료가 필요한 주제입니다. 참고 자료 업로드(Phase 2) 전까지 해당 사실은 본문에서 제외했습니다: ${analysis.facts_needed.join(", ") || "입시 사실 전반"}`,
          });
        }

        send({
          type: "result",
          mock: IS_MOCK,
          draft,
          plan,
          regionIndex,
          plainText: renderPlainText(draft),
          html: renderHtml(draft),
          quality,
        });
      } catch (e) {
        console.error(`[generate:${stage}]`, e);
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
