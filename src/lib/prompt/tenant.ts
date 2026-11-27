// 2) 학원별 브랜드 정보 · 4) 학원별 문체 — 테넌트 설정에서만 만든다. 다른 학원 값이 섞이지 않는다.
import type { Brand } from "../settings";
import { displayName, type TenantProfile } from "../tenant";

const line = (label: string, v: string | string[]) => {
  const s = Array.isArray(v) ? v.join(", ") : v;
  return s.trim() ? `- ${label}: ${s}` : "";
};
const lines = (xs: string[]) => xs.filter(Boolean).join("\n");

export function tenantBrandBlock(t: TenantProfile, b: Brand) {
  return `[학원 정보 — 등록된 값만 사용, 없는 정보는 만들지 않음]
${lines([
  line("학원명", displayName(t)),
  line("학원 유형", t.academyType === "기타 교육기관" && t.academyTypeCustom ? t.academyTypeCustom : t.academyType),
  line("작성자 표기", b.author),
  line("위치", t.location),
  line("주요 교육 과정", t.courses),
  line("학원 소개", t.description),
  line("학원 특징", t.features),
  line("강사진", t.instructors),
])}${b.narrator.trim() ? `

[글쓴이 시점]
- 이 글은 "${b.narrator.trim()}"이(가) 직접 쓴다. "우리 반에서는", "상담하다 보면"처럼 이 사람이 현장에서 보고 겪는 시점으로 쓴다.
- 시점만 빌린다. 등록 정보·현장 메모에 없는 경력·성과·학생 사례는 지어내지 않는다.` : ""}`;
}

export function tenantStyleBlock(t: TenantProfile) {
  const p = t.styleProfile;
  const parts = [
    "[학원 문체·독자]",
    line("기본 문체", t.tone || "학원 공식 블로그의 정중한 안내문 말투(~입니다, ~하세요), 정확하고 실용적으로"),
    line("주요 독자", t.targetAudience),
    line("지역 SEO 키워드(자연스러울 때만 1~2회)", t.seoKeywords),
    t.prohibited.length ? `- 이 학원이 쓰지 않는 표현: ${t.prohibited.map((x) => `"${x}"`).join(", ")}` : "",
  ];
  if (p) {
    parts.push(
      "[기존 블로그 글에서 분석한 문체 — 이 습관을 따르되, 공통 [금지] 규칙과 사실 정확성 규칙이 항상 우선한다]",
      line("말투", p.tone),
      line("자주 쓰는 종결", p.sentenceEndings),
      line("도입부", p.introPattern),
      line("소제목", p.headingStyle),
      line("구성", p.structure),
      line("마무리", p.closingPattern),
      line("서식", p.formatting),
      line("피할 것", p.avoid),
    );
  }
  if (t.styleExcerpts.length) {
    parts.push(
      `[이 학원의 기존 글 발췌 — 문체·호흡만 참고, 문장·예문·숫자는 복제하지 않음]\n${t.styleExcerpts
        .map((s, i) => `<sample_${i + 1}>\n${s}\n</sample_${i + 1}>`)
        .join("\n")}`,
    );
  }
  return lines(parts);
}
