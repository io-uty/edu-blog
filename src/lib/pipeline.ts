import "server-only";
import { generateJson, LIGHT_MODEL } from "./llm";
import { mockAnalysis, mockDraft, mockPlan } from "./mock";
import { applyPolish, PolishSchema, polishInput } from "./humanize";
import { analysisPrompt, draftPrompt, planPrompt, polishPrompt, polishSystem, systemPrompt, type PromptCtx } from "./prompts";
import { AnalysisSchema, DraftSchema, PlanSchema, type Analysis, type Draft, type Plan } from "./schemas";

export type StageName = "analysis" | "plan" | "draft";

export interface PipelineInput {
  topic: string;
  contentType: string;
  ctx: PromptCtx;
  // 중간 실패 시 이미 완료된 단계 결과를 넘겨 이어서 생성
  resume?: { analysis?: Analysis; plan?: Plan };
}

export function runAnalysis(i: PipelineInput) {
  return generateJson({
    system: systemPrompt(i.ctx),
    user: analysisPrompt(i.topic, i.contentType, i.ctx),
    schema: AnalysisSchema,
    mock: () => mockAnalysis(i.topic),
    maxTokens: 1500,
    // 일정·제도·통계처럼 확인이 필요한 사실만 공식 출처에서 찾아본다
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
  });
}

export function runPlan(i: PipelineInput, analysis: Analysis) {
  return generateJson({
    system: systemPrompt(i.ctx),
    user: planPrompt(i.topic, i.contentType, analysis, i.ctx),
    schema: PlanSchema,
    mock: () => mockPlan(i.topic),
    maxTokens: 2500,
  });
}

export function runDraft(i: PipelineInput, analysis: Analysis, plan: Plan): Promise<Draft> {
  return generateJson({
    system: systemPrompt(i.ctx),
    user: draftPrompt(i.topic, i.contentType, analysis, plan, i.ctx),
    schema: DraftSchema,
    mock: () => mockDraft(i.topic),
    maxTokens: 6000,
  });
}

/** 본문 윤문(AI 티 제거). 실패하거나 내용이 바뀐 문단은 원문을 쓴다. */
export async function runPolish(i: PipelineInput, draft: Draft): Promise<Draft> {
  const input = polishInput(draft);
  const out = await generateJson({
    system: polishSystem(i.ctx),
    user: polishPrompt(input, i.ctx),
    schema: PolishSchema,
    mock: () => input,
    maxTokens: 8000,
    // 문체만 고치는 단계라 깊게 생각할 필요가 없다.
    model: LIGHT_MODEL,
    effort: "low",
  });
  return applyPolish(draft, out);
}
