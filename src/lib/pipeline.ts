import "server-only";
import type { ContentType } from "@/config/brand";
import { generateJson } from "./llm";
import { mockAnalysis, mockDraft, mockPlan } from "./mock";
import { SYSTEM_PROMPT, analysisPrompt, draftPrompt, planPrompt } from "./prompts";
import { styleSamplesBlock } from "./styleSamples";
import { AnalysisSchema, DraftSchema, PlanSchema, type Analysis, type Draft, type Plan } from "./schemas";

export type StageName = "analysis" | "plan" | "draft";

export interface PipelineInput {
  topic: string;
  contentType: string;
  // 중간 실패 시 이미 완료된 단계 결과를 넘겨 이어서 생성
  resume?: { analysis?: Analysis; plan?: Plan };
}

export function runAnalysis(i: PipelineInput) {
  return generateJson({
    system: SYSTEM_PROMPT,
    user: analysisPrompt(i.topic, i.contentType),
    schema: AnalysisSchema,
    mock: () => mockAnalysis(i.topic),
    maxTokens: 1500,
  });
}

export function runPlan(i: PipelineInput, analysis: Analysis) {
  return generateJson({
    system: SYSTEM_PROMPT,
    user: planPrompt(i.topic, i.contentType, analysis),
    schema: PlanSchema,
    mock: () => mockPlan(i.topic),
    maxTokens: 2500,
  });
}

export function runDraft(i: PipelineInput, analysis: Analysis, plan: Plan): Promise<Draft> {
  return generateJson({
    // 문체 샘플은 실제 글을 쓰는 단계에만 넣는다
    system: SYSTEM_PROMPT + styleSamplesBlock(i.contentType as ContentType),
    user: draftPrompt(i.topic, i.contentType, analysis, plan),
    schema: DraftSchema,
    mock: () => mockDraft(i.topic),
    maxTokens: 6000,
  });
}
