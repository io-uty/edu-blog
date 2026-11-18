// 이미지 안에 들어갈 문구(글자는 코드로 렌더링한다). 클라이언트·서버 공용.
import { z } from "zod";
import type { Draft } from "./schemas";

export const ImageCopySchema = z.object({
  eyebrow: z.string().max(30), // 상단 작은 배지(예: 과목명, POINT 01)
  title: z.array(z.string().min(1).max(24)).min(1).max(3), // 큰 제목 1~3줄
  highlight: z.number().int().min(-1).max(2), // 강조할 제목 줄(-1: 없음)
  sub: z.string().max(40), // 한 줄 요약
  points: z.array(z.string().max(24)).max(4), // 체크 항목
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
      scene: "a focused university student studying at a desk with books and a highlighter",
    };
  }
  const s = d.sections[t.sectionIndex ?? 0];
  return {
    eyebrow: `POINT ${String((t.sectionIndex ?? 0) + 1).padStart(2, "0")}`,
    title: splitLines(s.heading, 9),
    highlight: -1,
    sub: "",
    points: (s.bullets ?? []).slice(0, 3).map((b) => cut(b, 14)),
    scene: "a student reviewing notes at a desk, calm study atmosphere",
  };
}
