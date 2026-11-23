import { z } from "zod";

// STEP 1. 주제 분석
export const AnalysisSchema = z.object({
  core_topic: z.string(),
  target_reader: z.string(),
  reader_problem: z.string(),
  search_intent: z.string(),
  main_keyword: z.string(),
  sub_keywords: z.array(z.string()).min(1).max(4),
  core_message: z.string(),
  // 혼자 준비할 때 막히는 지점 ↔ 관리·진단이 푸는 방식(이전에 저장된 글에는 없음)
  academy_angle: z.string().optional(),
  // 사실 확인이 필요한 정보(전형·일정·인원·합격선·수업료·이벤트 등)
  facts_needed: z.array(z.string()),
  // 웹 검색으로 공식 출처에서 확인한 사실(이전에 저장된 글에는 없음)
  verified_facts: z.array(z.object({ fact: z.string(), source: z.string() })).optional(),
  // 근거 자료 없이 작성 가능한지
  can_write_without_sources: z.boolean(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// STEP 2. 콘텐츠 기획 (제목 끝 지역 표기·지역 태그는 코드가 붙이므로 여기 없음)
export const PlanSchema = z.object({
  title_candidates: z.array(z.string()).length(3),
  recommended_title: z.string(),
  intro_message: z.string(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        key_point: z.string(),
        use_table: z.boolean(),
        use_example: z.boolean(),
      }),
    )
    .min(3)
    .max(5),
  closing_message: z.string(),
  keyword_plan: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;

// STEP 3. 본문
const TableSchema = z.object({
  headers: z.array(z.string()).min(2),
  rows: z.array(z.array(z.string())).min(1),
});

export const ExampleSchema = z.object({
  // practice: 연습용 창작 예문/문제, scenario: 가상의 상황 예시
  kind: z.enum(["practice", "scenario"]),
  // 창작·가상이면 true. false는 실제 사례(근거 필수)라는 뜻
  is_fictional: z.boolean(),
  text: z.string(),
});

export const SectionSchema = z.object({
  heading: z.string(),
  paragraphs: z.array(z.string()).min(1).max(5),
  // 체크리스트·단계 등 짧은 항목 나열
  bullets: z.array(z.string()).nullable(),
  table: TableSchema.nullable(),
  example: ExampleSchema.nullable(),
});

export const DraftSchema = z.object({
  title: z.string(),
  introduction: z.array(z.string()).min(1).max(4),
  sections: z.array(SectionSchema).min(3).max(5),
  conclusion: z.array(z.string()).min(1).max(3),
  // AI 출력 단계에서는 주제 태그만, 최종 조립 후에는 전체 태그
  hashtags: z.array(z.string()).min(1),
});
export type Draft = z.infer<typeof DraftSchema>;
