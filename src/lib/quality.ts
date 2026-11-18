import { BANNED_PHRASES, BRAND, HASHTAG_COUNT, LENGTH_TARGET, MAX_TABLES, SECTION_RANGE } from "@/config/brand";
import { bodyCharCount } from "./render";
import type { Draft } from "./schemas";

export type Severity = "error" | "warning" | "info";
export interface QualityIssue {
  code: string;
  severity: Severity;
  message: string;
  excerpt?: string;
}
export type PublishStatus = "READY" | "NEEDS_REVIEW" | "FAILED";

// 사실 근거가 필요한 표현(숫자+단위, 날짜, 비율, 입시 지표)
const FACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\d+(\.\d+)?\s*%/g, label: "비율" },
  { re: /\d+\s*(명|문항|분\b|대\s?1|:1)/g, label: "인원/문항/시간/경쟁률" },
  { re: /\d{4}\s*(년|학년도)/g, label: "연도" },
  { re: /\d{1,2}\s*월\s*\d{1,2}\s*일/g, label: "날짜" },
  { re: /(합격률|합격선|경쟁률|커트라인|모집\s?인원)/g, label: "입시 지표" },
];
// 공식 예약 카드가 담당하는 홍보 정보 — 본문에서 AI가 쓰면 안 됨
const PROMO_RE = /(할인|굿즈|증정|이벤트|장학|무료\s?특강|수강료|수업료|\d[\d,]*\s*(원|만원))/g;

/**
 * 규칙 기반 품질 검사.
 * - 사실 검증 모듈(Phase 2) 전이므로 READY를 반환하지 않는다.
 * - 중대 오류(근거 없는 합격 주장, 실제 사례로 표시된 예시)는 FAILED.
 */
export function checkQuality(d: Draft) {
  const issues: QualityIssue[] = [];
  const bodyText = [
    d.title,
    ...d.introduction,
    ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? []), s.example?.text ?? ""]),
    ...d.sections.flatMap((s) => (s.table ? [...s.table.headers, ...s.table.rows.flat()] : [])),
    ...d.conclusion,
  ].join("\n");

  for (const phrase of BANNED_PHRASES) {
    if (!bodyText.includes(phrase)) continue;
    const fatal = /합격/.test(phrase);
    issues.push({
      code: fatal ? "UNSUPPORTED_CLAIM" : "BANNED_PHRASE",
      severity: "error",
      message: fatal ? `근거 없는 합격·성과 주장: "${phrase}"` : `금지 표현 사용: "${phrase}"`,
      excerpt: phrase,
    });
  }
  if (/오늘은[^.\n]{0,40}(보겠습니다|정리했습니다|정리해 보겠습니다)/.test(bodyText))
    issues.push({ code: "BANNED_PHRASE", severity: "error", message: `예고형 도입 문장 사용("오늘은 ~ 보겠습니다")` });

  for (const h of new Set(bodyText.match(PROMO_RE) ?? []))
    issues.push({ code: "PROMO_IN_BODY", severity: "error", message: "본문에 혜택·가격 언급(공식 예약 카드와 충돌 위험)", excerpt: h });

  for (const { re, label } of FACT_PATTERNS)
    for (const h of new Set(bodyText.match(re) ?? []))
      issues.push({ code: "FACT_NEEDS_SOURCE", severity: "warning", message: `근거 확인 필요(${label})`, excerpt: h });

  const len = bodyCharCount(d);
  if (len < LENGTH_TARGET.min * 0.9 || len > LENGTH_TARGET.max * 1.1)
    issues.push({ code: "LENGTH", severity: "warning", message: `본문 ${len}자 (권장 ${LENGTH_TARGET.min}~${LENGTH_TARGET.max}자)` });

  if (d.hashtags.length !== HASHTAG_COUNT)
    issues.push({ code: "HASHTAG_COUNT", severity: "warning", message: `해시태그 ${d.hashtags.length}개 (기존 글 기준 ${HASHTAG_COUNT}개)` });
  for (const t of BRAND.fixedHashtags)
    if (!d.hashtags.includes(t)) issues.push({ code: "HASHTAG_FIXED", severity: "warning", message: `고정 태그 누락: #${t}` });

  if (d.sections.length < SECTION_RANGE.min || d.sections.length > SECTION_RANGE.max)
    issues.push({ code: "SECTION_COUNT", severity: "warning", message: `소주제 ${d.sections.length}개 (권장 ${SECTION_RANGE.min}~${SECTION_RANGE.max}개)` });

  const tables = d.sections.filter((s) => s.table).length;
  if (tables > MAX_TABLES) issues.push({ code: "TABLE_COUNT", severity: "warning", message: `표 ${tables}개 (최대 ${MAX_TABLES}개)` });

  const lens = d.sections.map((s) => [...s.paragraphs, ...(s.bullets ?? [])].join("").length);
  if (Math.max(...lens) > Math.min(...lens) * 2.5)
    issues.push({ code: "SECTION_BALANCE", severity: "warning", message: `소주제 길이 불균형 (${lens.join(" / ")}자)` });

  d.sections.forEach((s, i) => {
    if (s.example && !s.example.is_fictional)
      issues.push({ code: "EXAMPLE_REAL_CASE", severity: "error", message: `소주제 ${i + 1} 예시가 실제 사례로 표시됨 — 근거 없으면 가상 표시 필요`, excerpt: s.example.text.slice(0, 40) });
  });

  issues.push({ code: "FACTCHECK_NOT_IMPLEMENTED", severity: "info", message: "사실 검증 모듈 미구현(Phase 2) — 사람이 검토 후 게시하세요" });

  const FATAL = new Set(["UNSUPPORTED_CLAIM", "EXAMPLE_REAL_CASE"]);
  const status: PublishStatus = issues.some((i) => FATAL.has(i.code)) ? "FAILED" : "NEEDS_REVIEW";
  return { status, issues, charCount: len };
}
