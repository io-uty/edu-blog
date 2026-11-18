// 프롬프트 조립: 1) 공통 규칙 → 2) 학원 브랜드 → 3) 업종 팩 → 4) 학원 문체 → 5) 주제 → 6) 검증된 자료
import { LENGTH_TARGET, MAX_TABLES, SECTION_RANGE, TOPIC_HASHTAG_COUNT } from "@/config/rules";
import { COMMON_FACT_RULES, COMMON_RULES, JSON_ONLY } from "./prompt/common";
import { tenantBrandBlock, tenantStyleBlock } from "./prompt/tenant";
import { verticalOf, type Vertical } from "./prompt/verticals";
import type { Analysis, Plan } from "./schemas";
import type { Brand } from "./settings";
import { displayName, type TenantProfile } from "./tenant";

export interface PromptCtx {
  tenant: TenantProfile;
  brand: Brand;
}

function verticalBlock(v: Vertical) {
  return `[교육 분야 — 이 분야의 독자와 구성에 맞춘다]
- 분야: ${v.domain}
- 기본 독자: ${v.defaultAudience}
- 단정하면 안 되는 사실: ${v.factTopics} → "${v.confirmGuide}"처럼 확인 방법으로 안내
- 이 분야에서 잘 읽히는 구성:
${v.composition.map((c) => `  - ${c}`).join("\n")}
- 예문 규칙: ${v.exampleRule}`;
}

const VERIFIED_SOURCES = `[검증된 자료]
- 현재 제공된 검증 자료 없음. 공식 확인이 필요한 사실은 쓰지 않는다.`;

export const systemPrompt = (ctx: PromptCtx) =>
  [
    `당신은 ${displayName(ctx.tenant)} 공식 네이버 블로그의 전문 콘텐츠 에디터입니다.`,
    COMMON_RULES,
    COMMON_FACT_RULES,
    tenantBrandBlock(ctx.tenant, ctx.brand),
    verticalBlock(verticalOf(ctx.tenant.academyType)),
    tenantStyleBlock(ctx.tenant),
    VERIFIED_SOURCES,
  ].join("\n\n");

export function analysisPrompt(topic: string, contentType: string, ctx: PromptCtx) {
  const v = verticalOf(ctx.tenant.academyType);
  return `블로그 주제를 분석하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
기본 독자: ${ctx.tenant.targetAudience || v.defaultAudience}

JSON 형식:
{
  "core_topic": "핵심 주제",
  "target_reader": "대상 독자",
  "reader_problem": "독자가 겪는 구체적 문제",
  "search_intent": "검색 의도",
  "main_keyword": "네이버 검색 메인 키워드 1개",
  "sub_keywords": ["서브 키워드 2~4개"],
  "core_message": "글에서 전달할 핵심 메시지 한 문장",
  "facts_needed": ["공식 근거가 있어야 쓸 수 있는 사실 항목. 없으면 빈 배열"],
  "can_write_without_sources": true 또는 false
}
${JSON_ONLY}`;
}

export function planPrompt(topic: string, contentType: string, analysis: Analysis, ctx: PromptCtx) {
  const v = verticalOf(ctx.tenant.academyType);
  const suffixes = ctx.brand.titleSuffixes;
  return `아래 분석을 바탕으로 블로그 글을 기획하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
분석: ${JSON.stringify(analysis)}

[제목 규칙]
- 형식: "[핵심 키워드 구]｜[독자의 고민을 푸는 구체적 내용]"  (전각 바 ｜ 사용). 질문형도 가능.
${suffixes.length ? `- 지역 표기 ${suffixes.map((t) => `"${t}"`).join(", ")} 등은 시스템이 붙이므로 쓰지 않는다.\n` : ""}- 예) ${v.titleExamples.map((t) => `"${t}"`).join(" / ")}
- 자극적·낚시성 문구 금지, 본문에서 다루지 않는 내용 금지

[소주제] ${SECTION_RANGE.min}~${SECTION_RANGE.max}개(보통 3~4개). 서로 다른 정보, 중복 금지. 표는 전체 최대 ${MAX_TABLES}개.
[근거 없는 사실] 다음 항목은 기획에서 제외하거나 확인 방법 안내로 대체: ${JSON.stringify(analysis.facts_needed)}

JSON 형식:
{
  "title_candidates": ["후보1", "후보2", "후보3"],
  "recommended_title": "최종 추천 제목",
  "intro_message": "도입부 첫 문장에서 줄 핵심 답",
  "sections": [
    { "heading": "소주제(번호 없이)", "key_point": "이 소주제에서만 전달할 정보", "use_table": false, "use_example": true }
  ],
  "closing_message": "마무리에서 권할 준비·점검 행동",
  "keyword_plan": "메인/서브 키워드를 어디에 자연스럽게 배치할지"
}
${JSON_ONLY}`;
}

export function draftPrompt(topic: string, contentType: string, analysis: Analysis, plan: Plan, ctx: PromptCtx) {
  const v = verticalOf(ctx.tenant.academyType);
  const name = displayName(ctx.tenant);
  return `기획안대로 네이버 블로그 본문을 작성하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
분석: ${JSON.stringify(analysis)}
기획: ${JSON.stringify(plan)}

[구성]
- 인사말은 시스템이 붙이므로 쓰지 않는다.
- introduction 1~3문단: 첫 문장에서 핵심 답 → 이 글에서 정리한 내용
- sections: 기획의 소주제 수와 순서 그대로. heading에 번호 금지(시스템이 부여). 각 2~4문단.
  - bullets: 체크리스트·단계·확인 항목이 있을 때만 짧은 항목 배열, 없으면 null
  - table: use_table=true인 곳에만, 없으면 null
  - example: use_example=true인 곳에만, 없으면 null. 예문 바로 다음 문단에서 근거를 짚어 설명한다.
- conclusion 1~2문단: 상담 전 준비·점검할 것 → "${name}에서 ~ 상담받아 보세요."
${ctx.brand.closingHeading ? `  마무리 소제목("${ctx.brand.closingHeading}")은 시스템이 붙인다.\n` : ""}- 본문(인사말·태그 제외, 공백 포함) 약 ${LENGTH_TARGET.min}~${LENGTH_TARGET.max}자. 분량을 위해 반복하지 않는다.
- hashtags: 이 글의 주제 태그 정확히 ${TOPIC_HASHTAG_COUNT}개만. '#' 없이, 띄어쓰기 없이. 예) ${JSON.stringify(v.hashtagExample)}
  학원명·지역 태그는 시스템이 붙이므로 넣지 않는다.

JSON 형식:
{
  "title": "기획의 recommended_title",
  "introduction": ["문단"],
  "sections": [
    {
      "heading": "소주제",
      "paragraphs": ["문단", "문단"],
      "bullets": null 또는 ["항목", "항목"],
      "table": null 또는 { "headers": ["항목","확인할 내용"], "rows": [["값","값"]] },
      "example": null 또는 { "kind": "practice" 또는 "scenario", "is_fictional": true, "text": "예문/예시" }
    }
  ],
  "conclusion": ["문단"],
  "hashtags": ["태그1", "태그2", "태그3"]
}
${JSON_ONLY}`;
}
