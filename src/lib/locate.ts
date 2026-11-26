import type { Draft } from "./schemas";
import { stripFmt } from "./richtext";

/** 검사 결과의 문구(excerpt)가 들어 있는 본문 블록 id를 찾는다. */
export function findBlock(d: Draft, excerpt?: string): string | null {
  if (!excerpt) return null;
  const has = (t: string) => stripFmt(t).includes(excerpt);
  if (has(d.title)) return "blk-title";
  if (d.introduction.some(has)) return "blk-intro";
  for (let i = 0; i < d.sections.length; i++) {
    const s = d.sections[i];
    const texts = [
      s.heading,
      ...s.paragraphs,
      ...(s.bullets ?? []),
      s.example?.text ?? "",
      ...(s.table ? [...s.table.headers, ...s.table.rows.flat()] : []),
    ];
    if (texts.some(has)) return `blk-s${i}`;
  }
  if (d.conclusion.some(has)) return "blk-concl";
  if (d.hashtags.some(has)) return "blk-tags";
  return null;
}

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const prev = el.style.backgroundColor;
  el.style.backgroundColor = "#fff4d6";
  setTimeout(() => (el.style.backgroundColor = prev), 1400);
}
