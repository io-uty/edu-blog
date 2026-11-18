import "server-only";
import { generateJson } from "./llm";
import { mockAnalysis, mockDraft, mockPlan } from "./mock";
import { analysisPrompt, draftPrompt, planPrompt, systemPrompt, type PromptCtx } from "./prompts";
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
