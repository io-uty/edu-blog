// 이미지 안에 들어갈 문구(글자는 코드로 렌더링한다). 클라이언트·서버 공용.
import { z } from "zod";
import type { Draft } from "./schemas";

export const ImageCopySchema = z.object({
  eyebrow: z.string().max(30), // 상단 작은 배지(예: 과목명, POINT 01)
  title: z.array(z.string().min(1).max(24)).min(1).max(3), // 큰 제목 1~3줄
  highlight: z.number().int().min(-1).max(2), // 강조할 제목 줄(-1: 없음)
  sub: z.string().max(40), // 한 줄 요약
  points: z.array(z.string().max(24)).max(4), // 체크 항목
  // 소주제 내용 정리 카드: 핵심 항목(label)과 한 줄 설명(detail)
  // 이 이미지를 그림 위주("scene")로 보일지, 내용 정리 카드("card")로 보일지
  visual: z.enum(["card", "scene"]),
  items: z.array(z.object({ label: z.string().max(18), detail: z.string().max(34) })).max(4),
  scene: z.string().max(600), // 일러스트 설명(영문, 글자 없는 그림)
});
export type ImageCopy = z.infer<typeof ImageCopySchema>;

export type ImageKind = "thumbnail" | "section";
export interface ImageTarget {
  kind: ImageKind;
  sectionIndex: number | null;
}

export const targetKey = (t: ImageTarget) => (t.kind === "thumbnail" ? "thumb" : `s${t.sectionIndex}`);

/** 긴 문장을 한 줄 maxLen자 안팎으로 나눈다(단어 단위). */
export function splitLines(text: string, maxLen = 9, maxLines = 3): string[] {
  const words = text.replace(/[｜|]/g, " ").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxLen) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
  return lines;
}

/** 문장 하나를 "항목: 설명"으로 나눈다(콜론·쉼표 앞부분을 항목으로, 없으면 앞부분을 잘라 항목으로) */
function toItem(text: string): { label: string; detail: string } {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{2,14}?)\s*[:：]\s*(.+)$/);
  if (m) return { label: cut(m[1], 14), detail: cut(m[2], 30) };
  const first = t.split(/(?<=[.!?。])\s|,\s|，/)[0] ?? t;
  return { label: cut(first, 14), detail: first.length < t.length ? cut(t.slice(first.length).replace(/^[,，.\s]+/, ""), 30) : "" };
}

/** "항목: 설명" 한 줄 문자열 ↔ 항목 (편집 화면용) */
export const itemsToText = (items: ImageCopy["items"] | undefined) => (items ?? []).map((i) => (i.detail ? `${i.label}: ${i.detail}` : i.label)).join("\n");
export const textToItems = (text: string): ImageCopy["items"] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((l) => {
      const m = l.match(/^(.*?)\s*[:：]\s*(.*)$/);
      return m ? { label: m[1].slice(0, 18), detail: m[2].slice(0, 34) } : { label: l.slice(0, 18), detail: "" };
    });

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** AI 없이 본문에서 바로 만드는 기본 문구(샘플 모드·대체용). */
export function fallbackCopy(d: Draft, t: ImageTarget, contentType: string): ImageCopy {
  if (t.kind === "thumbnail") {
    const [main, rest] = d.title.replace(/\(.*?\)\s*$/, "").split(/[｜|]/);
    return {
      eyebrow: cut(contentType, 12),
      title: splitLines(main.trim(), 8),
      highlight: 1,
      sub: cut((rest ?? "").trim(), 22),
      points: d.sections.slice(0, 3).map((s) => cut(s.heading, 14)),
      items: [],
      visual: "scene",
      scene: "A Korean student in her early twenties studying at a tidy wooden desk by a window, morning light, open notebook and highlighter, eye-level medium shot with soft blurred background above.",
    };
  }
  const s = d.sections[t.sectionIndex ?? 0];
  return {
    eyebrow: `POINT ${String((t.sectionIndex ?? 0) + 1).padStart(2, "0")}`,
    title: splitLines(s.heading, 9),
    highlight: -1,
    sub: "",
    points: (s.bullets ?? []).slice(0, 3).map((b) => cut(b, 14)),
    // 본문의 체크 항목(없으면 문단)을 그대로 정리 카드 항목으로 쓴다
    items: (s.bullets && s.bullets.length ? s.bullets : s.paragraphs).slice(0, 4).map(toItem),
    visual: "scene",
    scene: "Close-up of a student's hands writing in a study planner on a desk, warm lamp light, shallow depth of field.",
  };
}
