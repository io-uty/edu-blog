import type { Draft } from "./schemas";
import { DEFAULT_SETTINGS, resolveBrand, type FormatTemplate, type Settings } from "./settings";

/** 본문에 이미지가 들어갈 위치(썸네일 여부, 이미지가 있는 소주제 번호) */
export interface ImageSlots {
  thumbnail: boolean;
  sections: number[];
}

/** 이미지 위치 표시 문구 — 썸네일이 1번, 이후 소주제 순서대로 번호를 매긴다. */
export function slotLabels(d: Draft, slots?: ImageSlots) {
  const labels = new Map<string, string>();
  if (!slots) return labels;
  let n = 1;
  if (slots.thumbnail) labels.set("thumb", `[이미지 ${n++} · 썸네일]`);
  d.sections.forEach((_, i) => {
    if (slots.sections.includes(i)) labels.set(`s${i}`, `[이미지 ${n++} · 소주제 ${i + 1}]`);
  });
  return labels;
}

export function headingText(i: number, h: string, f: FormatTemplate) {
  if (f.headingPrefix === "number") return `${i + 1}. ${h}`;
  if (f.headingPrefix === "dash") return `- ${h}`;
  return h;
}

export function renderHashtags(tags: string[]) {
  return tags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`).join(" ");
}

/** 네이버 에디터에 붙여넣기용 순수 텍스트 */
export function renderPlainText(d: Draft, s: Settings = DEFAULT_SETTINGS, slots?: ImageSlots): string {
  const { format: f } = s;
  const brand = resolveBrand(s.brand);
  const labels = f.imageMarkers ? slotLabels(d, slots) : new Map<string, string>();
  const gap = f.blankLineBetween ? [""] : [];
  const out: string[] = [];
  if (labels.has("thumb")) out.push(labels.get("thumb")!, ...gap);
  if (brand.greeting) out.push(brand.greeting, ...gap);
  out.push(...d.introduction.flatMap((p) => [p, ...gap]));
  d.sections.forEach((sec, i) => {
    out.push(headingText(i, sec.heading, f), ...gap);
    if (labels.has(`s${i}`)) out.push(labels.get(`s${i}`)!, ...gap);
    sec.paragraphs.forEach((p) => out.push(p, ...gap));
    if (sec.bullets?.length) out.push(...sec.bullets.map((b) => `${f.listMarker} ${b}`), ...gap);
    if (sec.table) out.push(sec.table.headers.join(" | "), ...sec.table.rows.map((r) => r.join(" | ")), ...gap);
    if (sec.example) out.push(sec.example.text, ...gap);
  });
  if (brand.closingHeading) out.push(brand.closingHeading, ...gap);
  out.push(...d.conclusion.flatMap((p) => [p, ...gap]));
  out.push(renderHashtags(d.hashtags));
  if (brand.bookingUrl) out.push(...gap, brand.bookingUrl);
  if (brand.placePhone.trim()) out.push(...gap, `전화 ${brand.placePhone.trim()}`);
  if (brand.placeUrl.trim()) out.push(...gap, brand.placeUrl.trim());
  return out.join("\n").trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const color = (c: string, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback);
const size = (n: number, fallback: number) => (Number.isFinite(n) && n >= 8 && n <= 60 ? Math.round(n) : fallback);

/**
 * 네이버 스마트에디터에 붙여넣기 위한 HTML.
 * 블로그 설정의 서식 템플릿(정렬, 본문·소제목 크기, 소제목 색, 목록 기호)을 인라인 스타일로 넣는다.
 */
export function renderHtml(d: Draft, s: Settings = DEFAULT_SETTINGS, slots?: ImageSlots): string {
  const { format: f } = s;
  const brand = resolveBrand(s.brand);
  const align = ["justify", "left", "center"].includes(f.align) ? f.align : "justify";
  const bodyPx = size(f.bodySize, 19);
  const headPx = size(f.headingSize, 24);
  const headColor = color(f.headingColor, "#8c8c8c");
  const labels = f.imageMarkers ? slotLabels(d, slots) : new Map<string, string>();

  const P = (inner: string) => `<p style="text-align:${align};">${inner}</p>`;
  const span = (t: string, extra = "") => `<span style="font-size:${bodyPx}px;${extra}">${esc(t)}</span>`;
  const body = (t: string) => P(span(t));
  const gap = f.blankLineBetween ? "<p><br></p>" : "";
  const heading = (t: string) => {
    const inner = `<span style="font-size:${headPx}px;color:${headColor};">${esc(t)}</span>`;
    return P(f.headingBold ? `<b>${inner}</b>` : inner);
  };
  // data-slot: 본문 복사 때 이 자리를 실제 이미지로 바꾼다(PublishView)
  const marker = (k: string) =>
    labels.has(k) ? [`<p data-slot="${k}" style="text-align:${align};">${span(`${labels.get(k)} 이 자리에 이미지를 넣으세요`, "color:#999999;")}</p>`, gap] : [];

  const html: string[] = [...marker("thumb"), ...(brand.greeting ? [body(brand.greeting), gap] : []), ...d.introduction.flatMap((p) => [body(p), gap])];
  d.sections.forEach((sec, i) => {
    html.push(heading(headingText(i, sec.heading, f)), gap, ...marker(`s${i}`));
    sec.paragraphs.forEach((p) => html.push(body(p), gap));
    if (sec.bullets?.length) html.push(...sec.bullets.map((b) => body(`${f.listMarker} ${b}`)), gap);
    if (sec.table) {
      const cell = (tag: "th" | "td", t: string) =>
        `<${tag} style="border:1px solid #dddddd;padding:6px 10px;">${span(t)}</${tag}>`;
      html.push(
        `<table style="border-collapse:collapse;width:100%;"><thead><tr>${sec.table.headers.map((h) => cell("th", h)).join("")}</tr></thead><tbody>${sec.table.rows
          .map((r) => `<tr>${r.map((c) => cell("td", c)).join("")}</tr>`)
          .join("")}</tbody></table>`,
        gap,
      );
    }
    if (sec.example) html.push(`<blockquote>${body(sec.example.text)}</blockquote>`, gap);
  });
  if (brand.closingHeading) html.push(heading(brand.closingHeading), gap);
  html.push(...d.conclusion.flatMap((p) => [body(p), gap]));
  html.push(body(renderHashtags(d.hashtags)));
  // http(s)만 링크로: javascript: 주소가 미리보기에서 클릭 시 실행되지 않게
  if (/^https?:\/\//i.test(brand.bookingUrl)) html.push(gap, P(`<a href="${esc(brand.bookingUrl)}">${esc(brand.bookingUrl)}</a>`));
  else if (brand.bookingUrl) html.push(gap, body(brand.bookingUrl));
  const phone = brand.placePhone.trim();
  if (phone) html.push(gap, P(`<b><span style="font-size:13px;">전화 ${esc(phone)}</span></b>`));
  // 네이버 플레이스 링크 — 에디터가 링크 카드(지도)로 바꿔 보여준다
  const place = brand.placeUrl.trim();
  if (/^https?:\/\//i.test(place)) html.push(gap, P(`<a href="${esc(place)}">${esc(place)}</a>`));
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
