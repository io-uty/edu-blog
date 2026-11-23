import type { QualityIssue } from "./quality";
import type { Quality } from "./store";

export interface CheckRow {
  key: string;
  label: string;
  value: string;
  ok: boolean;
  issues: QualityIssue[];
}

const pick = (q: Quality, codes: string[]) => q.issues.filter((i) => codes.includes(i.code));

/** 규칙 기반 검사 결과를 검토 항목으로 묶는다(경고 표시 없이 차분하게 보여준다). */
export function buildChecks(q: Quality): CheckRow[] {
  const src = pick(q, ["FACT_NEEDS_SOURCE", "SOURCES_REQUIRED"]);
  const style = pick(q, ["BANNED_PHRASE", "UNSUPPORTED_CLAIM", "PROMO_IN_BODY", "EXAMPLE_REAL_CASE"]);
  const tell = pick(q, ["AI_TELL"]);
  const form = pick(q, ["LENGTH", "SECTION_COUNT", "SECTION_BALANCE", "TABLE_COUNT", "HASHTAG_COUNT", "HASHTAG_FIXED"]);
  return [
    { key: "src", label: "확인할 사실 표현", value: src.length ? `${src.length}건` : "없음", ok: !src.length, issues: src },
    { key: "style", label: "브랜드 문체", value: style.length ? `${style.length}건 확인` : "적합", ok: !style.length, issues: style },
    { key: "tell", label: "자연스러움(AI 티)", value: tell.length ? `${tell.length}건 확인` : "적합", ok: !tell.length, issues: tell },
    { key: "form", label: "구성·분량", value: form.length ? `${form.length}건 확인` : "적합", ok: !form.length, issues: form },
  ];
}

export const HUMAN_REVIEW_NOTICE = "사람이 직접 검수하는 과정이 필요합니다.";
