import { BRAND } from "@/config/brand";
import type { Draft } from "./schemas";

export const EXAMPLE_LABEL = {
  practice: "※ 연습을 위해 만든 예문입니다(실제 기출 아님).",
  scenario: "※ 가상의 예시입니다.",
} as const;

type Section = Draft["sections"][number];
const exampleLabel = (e: NonNullable<Section["example"]>) => (e.is_fictional ? EXAMPLE_LABEL[e.kind] : "");

/** 네이버 에디터에 붙여넣기용 순수 텍스트 */
export function renderPlainText(d: Draft): string {
  const out: string[] = [BRAND.greeting, "", ...d.introduction.flatMap((p) => [p, ""])];
  d.sections.forEach((s, i) => {
    out.push(`${i + 1}. ${s.heading}`, "");
    s.paragraphs.forEach((p) => out.push(p, ""));
    if (s.bullets?.length) out.push(...s.bullets.map((b) => `· ${b}`), "");
    if (s.table) {
      out.push(s.table.headers.join(" | "), ...s.table.rows.map((r) => r.join(" | ")), "");
    }
    if (s.example) {
      const label = exampleLabel(s.example);
      if (label) out.push(label);
      out.push(s.example.text, "");
    }
  });
  out.push(BRAND.closingHeading, "", ...d.conclusion.flatMap((p) => [p, ""]));
  out.push(renderHashtags(d.hashtags), "", BRAND.bookingUrl);
  return out.join("\n").trim();
}

export function renderHashtags(tags: string[]) {
  return tags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`).join(" ");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 네이버 스마트에디터에 서식(소제목 굵게, 목록, 표)을 유지해 붙여넣기 위한 HTML */
export function renderHtml(d: Draft): string {
  const p = (t: string) => `<p>${esc(t)}</p>`;
  const br = "<p><br></p>";
  const html: string[] = [p(BRAND.greeting), br, ...d.introduction.map(p)];
  d.sections.forEach((s, i) => {
    html.push(br, `<p><b>${i + 1}. ${esc(s.heading)}</b></p>`, ...s.paragraphs.map(p));
    if (s.bullets?.length) html.push(`<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
    if (s.table) {
      html.push(
        `<table border="1" cellpadding="6" style="border-collapse:collapse"><thead><tr>${s.table.headers
          .map((h) => `<th>${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${s.table.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    }
    if (s.example) {
      const label = exampleLabel(s.example);
      if (label) html.push(`<p><i>${esc(label)}</i></p>`);
      html.push(`<blockquote>${esc(s.example.text)}</blockquote>`);
    }
  });
  html.push(br, `<p><b>${esc(BRAND.closingHeading)}</b></p>`, ...d.conclusion.map(p));
  html.push(br, p(renderHashtags(d.hashtags)), br, `<p><a href="${BRAND.bookingUrl}">${BRAND.bookingUrl}</a></p>`);
  return html.join("");
}

/** 분량 계산용 본문(인사말·마무리 소제목·해시태그·예약 링크 제외, 공백 포함) */
export function bodyCharCount(d: Draft): number {
  const parts = [
    ...d.introduction,
    ...d.sections.flatMap((s) => [
      s.heading,
      ...s.paragraphs,
      ...(s.bullets ?? []),
      ...(s.table ? [s.table.headers.join(" "), ...s.table.rows.map((r) => r.join(" "))] : []),
      ...(s.example ? [s.example.text] : []),
    ]),
    ...d.conclusion,
  ];
  return parts.join("\n").length;
}
