"use client";

import type { Settings } from "@/lib/settings";
import { imageLabel, sortImages, type DocRecord, type ImageItem } from "@/lib/store";
import { greetingSticker } from "@/lib/extras";
import { renderBlob } from "./useRendered";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "블로그글";

/** 글의 마지막 이미지(이미지가 2장 이상일 때)는 움짤(GIF)로 내보낸다. */
export function isAnimated(items: ImageItem[], it: ImageItem) {
  const s = sortImages(items);
  return s.length > 1 && s[s.length - 1].id === it.id;
}

export function imageFileName(items: ImageItem[], it: ImageItem) {
  const n = sortImages(items).findIndex((x) => x.id === it.id) + 1;
  return `${String(n).padStart(2, "0")}-${imageLabel(it).replace(/\s/g, "")}.${isAnimated(items, it) ? "gif" : "png"}`;
}

/** 목록 순서대로 파일 이름·형식(마지막은 GIF)을 맞춰 렌더링한다. */
export const renderFile = (items: ImageItem[], it: ImageItem, design: Settings["image"]) => renderBlob(it, design, isAnimated(items, it));

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 이미지만, 또는 글(제목·본문·태그) + 이미지 전체를 zip으로 묶는다. */
export async function buildZip(
  doc: DocRecord,
  settings: Settings,
  text: { plainText: string; html: string; tags: string } | null,
): Promise<{ blob: Blob; name: string }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const items = sortImages(doc.images);
  const dir = text ? zip.folder("images")! : zip;
  dir.file("00-인사스티커.png", await greetingSticker(doc.id, settings.image));
  for (const it of items) dir.file(imageFileName(items, it), await renderFile(items, it, settings.image));
  if (text) {
    zip.file("제목.txt", doc.draft.title);
    zip.file("본문.txt", text.plainText);
    zip.file("본문.html", `<!doctype html><meta charset="utf-8"><body>${text.html}</body>`);
    zip.file("태그.txt", text.tags);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, name: `${safe(doc.draft.title)}${text ? "" : "-이미지"}.zip` };
}
