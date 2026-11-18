import { BANNED_PHRASES, BRAND, LENGTH_TARGET, MAX_TABLES, SECTION_RANGE, TOPIC_HASHTAG_COUNT } from "@/config/brand";
import type { Analysis, Plan } from "./schemas";

// 기존 공식 블로그 글 4건(2026.11)에서 추출한 문체 규칙
const STYLE_GUIDE = `
[브랜드/화자]
- 브랜드: ${BRAND.name} / 작성자: ${BRAND.author}
- 독자: 편입을 준비하는 수험생 / 문체: 친절하고 전문적인 학습 컨설턴트, "~하세요", "~해 보세요" 위주의 자연스러운 존댓말
- 광고 문구보다 바로 써먹을 수 있는 학습·준비 방법에 집중

[기존 글에서 확인된 패턴]
- 도입부 첫 문장에서 바로 답을 준다. 예: "~가 헷갈린다면, ~부터 정리해 보세요." / "~를 준비한다면 ~로 확인하세요."
  그다음 이 글에서 무엇을 정리했는지 한두 문장으로 밝힌다.
- 소제목은 "행동 + 대상"의 짧은 문장형. 예: "빈칸이 어떤 상황을 가리키는지 확인합니다", "역접 앞뒤를 나누고, 같은 뜻의 표현을 찾습니다".
  영역이나 시기를 나눌 때는 "영어｜어휘·문법·빈칸·독해로 나눠 오답을 보세요", "1주차｜지원 후보와 자격을 정리하세요"처럼 전각 바(｜)를 쓴다.
- 체크리스트, 단계, 확인 항목은 짧은 항목 나열(bullets)로 쓴다.
- 표는 2열 "항목 | 확인할 내용/활용 방법" 형태가 많다. 숫자 통계 표는 만들지 않는다.
- 영어 학습 글은 짧은 창작 영어 예문/문제를 직접 보여주고, 근거 표현을 짚고, 오답이 왜 틀렸는지 설명한다.
- 오답·복습 방법은 "원인을 나눠 기록하기"처럼 구체적인 행동으로 제시한다.
- 마무리는 (1) 상담 전에 준비하거나 점검할 것 (2) "${BRAND.name}에서 ~을 상담받아 보세요" 한 문장으로 짧게 끝낸다.
- 단정 대신 "~하는 것이 좋습니다", "~할 수 있습니다"처럼 신중한 표현을 쓰고, 공식 확인이 필요한 부분은 확인하라고 안내한다.

[금지]
- 금지 표현: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}
- "오늘은 ~ 정리해 보겠습니다" 같은 예고형 문장, 같은 내용을 표현만 바꿔 반복하기, 이모지 남용
- 할인·굿즈·이벤트·등록 혜택 언급(공식 예약 링크 카드가 따로 붙는다)
`.trim();

const FACT_RULES = `
[사실 정확성 규칙 — 최우선]
- 정보는 A(공식 확인된 정보), B(일반 교육 정보: 문법·독해·수학 학습법 등), C(확인되지 않은 정보)로 구분한다.
- 현재 근거 자료가 제공되지 않았으므로 A에 해당하는 사실은 쓰지 않는다.
- 대학별 전형, 시험 과목·문항 수·시간, 일정, 모집 인원, 합격선, 경쟁률, 합격률, 수업료, 할인·이벤트, 강의·교수진 정보를 단정하지 않는다.
  → "지원 학년도의 최신 모집요강에서 확인하세요"처럼 확인 방법을 안내하는 문장으로 대체한다.
- 출처, URL, 학년도별 변경사항을 지어내지 않는다.
- 연습용 영어 예문·문제는 example.kind="practice", is_fictional=true. 실제 기출이라고 하지 않는다.
- 가상의 학생·상황은 example.kind="scenario", is_fictional=true. 실제 학생·합격 사례처럼 쓰지 않는다.
- 영어 예문은 문법적으로 자연스럽고 정답이 하나로 정해져야 한다. 수학 식은 정확해야 한다.
`.trim();

const JSON_ONLY = "반드시 설명 없이 JSON 객체 하나만 출력하세요.";

export const SYSTEM_PROMPT = `당신은 ${BRAND.name} 공식 네이버 블로그의 전문 콘텐츠 에디터입니다.\n\n${STYLE_GUIDE}\n\n${FACT_RULES}`;

export function analysisPrompt(topic: string, contentType: string) {
  return `블로그 주제를 분석하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}

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

export function planPrompt(topic: string, contentType: string, analysis: Analysis) {
  return `아래 분석을 바탕으로 블로그 글을 기획하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
분석: ${JSON.stringify(analysis)}

[제목 규칙]
- 형식: "[핵심 키워드 구]｜[독자의 고민을 푸는 구체적 내용]"  (전각 바 ｜ 사용)
- 지역 표기 "(강남역 편입학원)" 등은 시스템이 붙이므로 쓰지 않는다.
- 질문형도 가능. 예) "긴 편입영어 지문의 핵심 문장을 찾는 방법은 무엇인가요?｜문단 중심 내용과 연결어 활용법"
- 예) "편입영어 빈칸 추론｜보기 두 개가 다 맞아 보일 때 정답을 가르는 단서"
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

export function draftPrompt(topic: string, contentType: string, analysis: Analysis, plan: Plan) {
  return `기획안대로 네이버 블로그 본문을 작성하세요.

주제: ${topic}
콘텐츠 유형: ${contentType}
분석: ${JSON.stringify(analysis)}
기획: ${JSON.stringify(plan)}

[구성]
- 인사말은 시스템이 붙이므로 쓰지 않는다.
- introduction 1~3문단: 첫 문장에서 핵심 답 → 이 글에서 정리한 내용
- sections: 기획의 소주제 수와 순서 그대로. heading에 번호 금지(시스템이 1, 2, 3 부여). 각 2~4문단.
  - bullets: 체크리스트·단계·확인 항목이 있을 때만 짧은 항목 배열, 없으면 null
  - table: use_table=true인 곳에만, 없으면 null
  - example: use_example=true인 곳에만, 없으면 null. 예문 바로 다음 문단에서 근거를 짚어 설명한다.
- conclusion 1~2문단: 상담 전 준비·점검할 것 → "${BRAND.name}에서 ~ 상담받아 보세요." (혜택·할인 언급 금지)
  마무리 소제목("${BRAND.closingHeading}")은 시스템이 붙인다.
- 본문(인사말·태그 제외, 공백 포함) 약 ${LENGTH_TARGET.min}~${LENGTH_TARGET.max}자. 분량을 위해 반복하지 않는다.
- hashtags: 이 글의 주제 태그 정확히 ${TOPIC_HASHTAG_COUNT}개만. '#' 없이, 띄어쓰기 없이. 예) ["편입영어", "편입영어빈칸추론", "편입영어독해"]
  지역·학원명 태그는 시스템이 붙이므로 넣지 않는다.

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
