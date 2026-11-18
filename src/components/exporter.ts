"use client";

import type { Settings } from "@/lib/settings";
import { imageLabel, sortImages, type DocRecord, type ImageItem } from "@/lib/store";
import { renderBlob } from "./useRendered";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "블로그글";

export function imageFileName(items: ImageItem[], it: ImageItem) {
  const n = sortImages(items).findIndex((x) => x.id === it.id) + 1;
  return `${String(n).padStart(2, "0")}-${imageLabel(it).replace(/\s/g, "")}.png`;
}

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
  for (const it of items) dir.file(imageFileName(items, it), await renderBlob(it, settings.image));
  if (text) {
    zip.file("제목.txt", doc.draft.title);
    zip.file("본문.txt", text.plainText);
    zip.file("본문.html", `<!doctype html><meta charset="utf-8"><body>${text.html}</body>`);
    zip.file("태그.txt", text.tags);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, name: `${safe(doc.draft.title)}${text ? "" : "-이미지"}.zip` };
}
