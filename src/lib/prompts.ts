// 프롬프트 조립: 1) 공통 규칙 → 2) 학원 브랜드 → 3) 업종 팩 → 4) 학원 문체 → 5) 주제 → 6) 검증된 자료
import { BANNED_PHRASES, LENGTH_TARGET, MAX_TABLES, SECTION_RANGE, TOPIC_HASHTAG_COUNT } from "@/config/rules";
import { COMMON_FACT_RULES, COMMON_RULES, JSON_ONLY } from "./prompt/common";
import { tenantBrandBlock, tenantStyleBlock } from "./prompt/tenant";
import { verticalOf, type Vertical } from "./prompt/verticals";
import type { Polish } from "./humanize";
import { HUMANIZE_RULES } from "./humanize";
import type { Analysis, Plan } from "./schemas";
import { resolveBrand, type Brand } from "./settings";
import { displayName, type TenantProfile } from "./tenant";

export interface PromptCtx {
  tenant: TenantProfile;
  brand: Brand;
}

function verticalBlock(v: Vertical) {
  return `[교육 분야 — 이 분야의 독자와 구성에 맞춘다]
- 분야: ${v.domain}
- 기본 독자: ${v.defaultAudience}
- 단정하면 안 되는 사실: ${v.factTopics} → 쓰지 않거나 "${v.confirmGuide}"처럼 확인 방법으로 안내(이 안내는 글 전체에서 1번만)
- 이 분야에서 잘 읽히는 구성:
${v.composition.map((c) => `  - ${c}`).join("\n")}
- 예문 규칙: ${v.exampleRule}`;
}

const VERIFIED_SOURCES = `[검증된 자료]
- 분석 단계에서 웹 검색으로 공식 출처를 확인한 사실은 분석의 verified_facts에 출처와 함께 들어 있다. 이것만 A 유형 사실로 쓸 수 있고, 쓸 때는 "교육부 발표에 따르면"처럼 출처 기관을 문장 안에서 밝힌다.
- verified_facts에 없는 공식 사실(일정·제도·인원·합격선 등)은 쓰지 않는다.`;

export const systemPrompt = (ctx: PromptCtx) =>
  [
    `당신은 ${displayName(ctx.tenant)} 공식 네이버 블로그의 정보형 안내글을 씁니다. 검색해 들어온 학생·학부모가 질문의 답과 직접 확인할 방법을 얻고, 필요하면 상담을 떠올리게 하는 것이 목표입니다. 전문성은 기준을 정확히 구분하고 구체적인 예와 확인 방법을 알려 주는 방식으로 보여 주세요. 강사 경력·성과·합격률·수강생 사례·커리큘럼·시설 등은 등록 정보나 검증된 자료에 있는 내용만 말하고, 그럴듯하게 보충하지 마세요.`,
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

[웹 검색]
- 글의 깊이를 더할 최신 제도·일정·공식 통계·개정 내용이 필요하면 web_search로 찾아본다(최대 2회, 가장 확인이 급한 사실부터). 학습법·개념 설명처럼 검색이 필요 없는 주제면 검색하지 않는다.
- 교육부, 한국교육과정평가원, 시·도 교육청, 대학 입학처, 시험 주관 기관 같은 공식 출처에서 확인된 내용만 verified_facts에 넣는다. 블로그·카페·커뮤니티 글은 근거로 쓰지 않는다.
- 확인한 사실은 verified_facts에, 확인하지 못한 사실은 facts_needed에 넣는다. 검색하지 않았으면 verified_facts는 빈 배열.

JSON 형식:
{
  "core_topic": "핵심 주제",
  "target_reader": "대상 독자",
  "reader_problem": "독자가 겪는 구체적 문제",
  "search_intent": "검색 의도",
  "main_keyword": "네이버 검색 메인 키워드 1개",
  "sub_keywords": ["서브 키워드 2~4개"],
  "core_message": "글에서 전달할 핵심 메시지 한 문장(전문가의 판단이 담긴 주장)",
  "academy_angle": "이 주제에서 혼자 준비할 때 막히는 지점과, 체계적 관리·전문가 진단이 그걸 어떻게 푸는지 한 문장",
  "verified_facts": [{ "fact": "웹 검색으로 확인한 사실 한 문장", "source": "출처 기관·페이지 이름" }],
  "facts_needed": ["공식 근거가 필요한데 검색으로도 확인하지 못한 사실 항목. 없으면 빈 배열"],
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
- 전문가가 붙일 법한 제목: 판단 기준·차이·갈리는 지점을 드러낸다(예: "~에서 갈리는 한 가지", "~ 전에 확인할 기준"). "완벽 정리", "총정리", "A to Z" 같은 상투어는 피한다.
${suffixes.length ? `- 지역 표기 ${suffixes.map((t) => `"${t}"`).join(", ")} 등은 시스템이 붙이므로 쓰지 않는다.\n` : ""}- 예) ${v.titleExamples.map((t) => `"${t}"`).join(" / ")}
- 자극적·낚시성 문구 금지, 본문에서 다루지 않는 내용 금지

[소주제] ${SECTION_RANGE.min}~${SECTION_RANGE.max}개(보통 3~4개). 서로 다른 정보, 중복 금지. 표는 전체 최대 ${MAX_TABLES}개.
- 흐름: 독자가 헷갈리는 기준을 구분 → 직접 확인·계산·준비하는 방법 → 놓치기 쉬운 예외나 다음 확인 순서. 학원 이야기는 마무리에서만(등록된 정보 범위 안). "혼자 하면 어렵다" 소주제를 만들지 않는다.
[근거 없는 사실] 다음 항목은 기획에서 제외하거나 확인 방법 안내로 대체: ${JSON.stringify(analysis.facts_needed)}

JSON 형식:
{
  "title_candidates": ["후보1", "후보2", "후보3"],
  "recommended_title": "최종 추천 제목",
  "intro_message": "도입부 첫 문장에서 줄 핵심 답(현장에서 본 판단을 단정형으로)",
  "sections": [
    { "heading": "소주제(번호 없이)", "key_point": "이 소주제에서만 전달할 정보", "use_table": false, "use_example": true }
  ],
  "closing_message": "독자가 준비해 올 것과 학원이 함께 확인해 줄 일(한두 문장)",
  "keyword_plan": "메인/서브 키워드를 어디에 자연스럽게 배치할지"
}
${JSON_ONLY}`;
}

/** 안부 인사용 오늘 날짜(한국 시간) */
const today = () => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date());

export function draftPrompt(topic: string, contentType: string, analysis: Analysis, plan: Plan, ctx: PromptCtx) {
  const v = verticalOf(ctx.tenant.academyType);
  const name = displayName(ctx.tenant);
  const closing = resolveBrand(ctx.brand, name).closingHeading;
  return `기획안대로 네이버 블로그 본문을 작성하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
분석: ${JSON.stringify(analysis)}
기획: ${JSON.stringify(plan)}

[구성]
- "안녕하세요! {학원명}입니다" 같은 고정 인사말은 시스템이 붙이므로 쓰지 않는다.
- introduction 2~3문단:
  - 첫 문단은 고정 인사말 바로 뒤에 이어질 안부 1~2문장. 지금 시기(${today()})와 이 글의 주제에 맞춰 독자의 요즘 상황을 헤아리는 말로 쓴다(예: 시험 기간이면 "기말고사 준비로 바쁘게 지내고 계시죠?", 방학 전이면 방학 계획 이야기). "안녕하세요"를 다시 쓰지 않고, 날씨 이야기만 늘어놓지 않으며, 주제와 동떨어진 안부는 쓰지 않는다.
  - 다음 문단부터 본론: 독자의 질문에 대한 답(결론)을 말하고, 기준이나 헷갈리는 지점을 짚는다. "이 글에서는 ~를 정리했습니다" 같은 목차 소개 문장은 쓰지 않는다.
- sections: 기획의 소주제 수와 순서 그대로. heading에 번호 금지(시스템이 부여). 각 3~4문단, 문단마다 3~5문장. 소제목은 독자가 할 일·구분할 기준을 한 문장으로.
  - 각 소주제는 "무엇을(기준·개념) → 왜 그런지(원리·이유) → 어떻게(구체적 단계·수치·예) → 흔히 하는 실수와 바로잡는 법" 중 필요한 것을 갖춰 깊이 있게 쓰되, 소주제마다 짜임과 순서를 다르게 한다(기준만 짚는 곳, 실수 사례부터 여는 곳, 단계 목록 위주인 곳). 모든 소주제를 같은 틀로 쓰거나 예시로 끝내지 않는다. 일반론으로 끝내지 않고, 현장에서 가르치는 사람이 아는 구체적인 판단 기준을 담는다.
  - bullets: 체크리스트·단계·확인 항목이 있을 때만 짧은 항목 배열, 없으면 null
  - table: use_table=true인 곳에만, 없으면 null
  - example: use_example=true인 곳에만, 없으면 null.
  - 화면에는 문단 → bullets → 표 → 예시 순서로 붙는다. 예시·표·목록을 "아래"로 가리키는 문장은 그 소주제의 마지막 문단에만 쓰고, 예시에 대한 설명은 예시 앞 문단에서 미리 짚는다.
- conclusion 1문단: "~가 고민이라면 ~를 정리해 오세요. ${name}에서 ~를 함께 확인해 드립니다."처럼 독자가 준비할 것과 학원이 도와줄 일. 필요하면 "최종 ~는 ~에서 확인해 주세요."로 끝낸다. 본문 요약 금지.
${closing ? `  마무리 소제목("${closing}")은 시스템이 붙인다.\n` : ""}- 본문(인사말·태그 제외, 공백 포함) ${LENGTH_TARGET.min}~${LENGTH_TARGET.max}자. 분량을 위해 반복하지 않는다.
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

/** 윤문 단계: 내용은 그대로, 문체·리듬·표현만 사람이 쓴 글처럼 */
export const polishSystem = (ctx: PromptCtx) =>
  [
    "당신은 한국어 블로그 원고를 다듬는 윤문 편집자입니다. 내용은 그대로 두고 문체·리듬·표현만 사람이 쓴 글처럼 고칩니다.",
    HUMANIZE_RULES,
    tenantStyleBlock(ctx.tenant),
  ].join("\n\n");

export function polishPrompt(p: Polish, ctx: PromptCtx) {
  return `아래 블로그 본문 JSON을 윤문하세요.

[지킬 것]
- 배열 개수와 순서를 그대로 둔다. 문단을 합치거나 나누지 않는다. bullets가 null이면 null.
- 사실·주장·수치·날짜·학원명·고유명사는 그대로 둔다. 새 정보·예시·비유를 넣지 않는다.
- 문장의 핵심 명사·개념어는 결과에 그대로 남긴다. 당위("~해야 합니다")·추측("~일 수 있습니다")의 강도를 바꾸지 않는다.
- 존댓말 등급은 원문과 같게 둔다.
- 이미 자연스러운 문장은 손대지 않는다. 바꾸는 양은 전체의 30% 안쪽.
- 특히 고칠 것: "세 갈래·세 가지" 같은 숫자 묶음 표현, "~하는 편이 좋습니다" 같은 돌려 권하는 말(바로 단언하거나 행동으로), 소주제마다 반복되는 "예를 들어" 마무리(문단 안으로 녹이거나 빼기), 문단 끝 교훈·격언 한 줄(사실 서술로 바꾸거나 앞 문장에 녹인다), 같은 확인 안내의 반복(첫 번째만 남기고 뒤는 그 문장만 뺀다), 문장마다 끼워 넣은 긴 키워드 구(자연스러운 말로), 40자를 훌쩍 넘는 문장이 이어질 때(둘로 나눈다).
- 소제목은 짧은 단정형을 유지하고, 어색할 때만 고친다.
- 금지 표현: ${[...BANNED_PHRASES, ...ctx.tenant.prohibited].map((x) => `"${x}"`).join(", ")}

본문:
${JSON.stringify(p)}

${JSON_ONLY}`;
}
