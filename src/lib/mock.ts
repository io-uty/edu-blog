// MOCK 모드 전용 더미 데이터. 실제 AI 생성물이 아니며 UI에 MOCK으로 표시된다.
import type { Analysis, Draft, Plan } from "./schemas";

export function mockAnalysis(topic: string): Analysis {
  return {
    core_topic: `[MOCK] ${topic}`,
    target_reader: "[MOCK] 수강 대상 학생",
    reader_problem: "[MOCK] API 미연결 상태의 더미 문제 정의",
    search_intent: "[MOCK] 정보 탐색",
    main_keyword: "[MOCK] 키워드",
    sub_keywords: ["[MOCK] 보조 키워드"],
    core_message: "[MOCK] 실제 생성 결과가 아닙니다.",
    facts_needed: [],
    can_write_without_sources: true,
  };
}

export function mockPlan(topic: string): Plan {
  return {
    title_candidates: [`[MOCK] ${topic}｜후보 1`, `[MOCK] ${topic}｜후보 2`, `[MOCK] ${topic}｜후보 3`],
    recommended_title: `[MOCK] ${topic}｜더미 제목`,
    intro_message: "[MOCK]",
    sections: [1, 2, 3].map((n) => ({
      heading: `[MOCK] 소주제 ${n}`,
      key_point: "[MOCK]",
      use_table: n === 2,
      use_example: n === 1,
    })),
    closing_message: "[MOCK]",
    keyword_plan: "[MOCK]",
  };
}

const filler = (n: number) =>
  `[MOCK ${n}] ANTHROPIC_API_KEY가 설정되지 않아 표시되는 더미 문단입니다. 화면 구성과 복사·검사 기능 확인용이며 실제 블로그에 게시하면 안 됩니다. `.repeat(2);

export function mockDraft(topic: string): Draft {
  return {
    title: `[MOCK] ${topic}｜더미 제목`,
    introduction: [filler(1), filler(2)],
    sections: [1, 2, 3].map((n) => ({
      heading: `[MOCK] 소주제 ${n}`,
      paragraphs: [filler(n * 10 + 1), filler(n * 10 + 2)],
      bullets: n === 3 ? ["[MOCK] 항목 1", "[MOCK] 항목 2"] : null,
      table: n === 2 ? { headers: ["항목", "확인할 내용"], rows: [["MOCK", "더미 행"]] } : null,
      example: n === 1 ? { kind: "practice" as const, is_fictional: true, text: "[MOCK] Practice sentence ______." } : null,
    })),
    conclusion: [filler(99)],
    hashtags: ["MOCK태그1", "MOCK태그2", "MOCK태그3"],
  };
}
