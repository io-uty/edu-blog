import type { QualityIssue } from "./quality";
import type { Quality } from "./store";

export type Tone = "ok" | "warn" | "err" | "muted";
export interface CheckRow {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  issues: QualityIssue[];
  note?: string;
}

const pick = (q: Quality, codes: string[]) => q.issues.filter((i) => codes.includes(i.code));

/**
 * 규칙 기반 검사 결과를 업무용 검수 항목으로 묶는다.
 * 주의: 사실 검증 모듈은 아직 없으므로 "통과"를 표시하지 않고 "미실시"로 둔다.
 */
export function buildChecks(q: Quality): CheckRow[] {
  const src = pick(q, ["FACT_NEEDS_SOURCE", "SOURCES_REQUIRED"]);
  const style = pick(q, ["BANNED_PHRASE", "UNSUPPORTED_CLAIM", "PROMO_IN_BODY", "EXAMPLE_REAL_CASE"]);
  const form = pick(q, ["LENGTH", "SECTION_COUNT", "SECTION_BALANCE", "TABLE_COUNT", "HASHTAG_COUNT", "HASHTAG_FIXED"]);
  return [
    { key: "fact", label: "사실 검증", value: "미실시", tone: "warn", issues: [], note: "자동 사실 검증은 아직 제공되지 않습니다. 게시 전 사람이 직접 확인하세요." },
    {
      key: "src",
      label: "근거 확인 필요",
      value: src.length ? `${src.length}건` : "없음",
      tone: src.length ? "warn" : "ok",
      issues: src,
    },
    {
      key: "style",
      label: "브랜드 문체",
      value: style.length ? `${style.length}건 위반` : "적합",
      tone: style.some((i) => i.severity === "error") ? "err" : style.length ? "warn" : "ok",
      issues: style,
    },
    {
      key: "form",
      label: "구성·분량",
      value: form.length ? `${form.length}건 확인` : "적합",
      tone: form.length ? "warn" : "ok",
      issues: form,
    },
    { key: "img", label: "이미지", value: "미제공", tone: "muted", issues: [] },
  ];
}
