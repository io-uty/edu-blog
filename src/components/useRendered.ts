"use client";

import { useEffect, useState } from "react";
import { idbGet } from "@/lib/idb";
import { toGif } from "@/lib/extras";
import { autoLayout, canvasToBlob, loadImage, photoFinish, renderImage, variantDesign } from "@/lib/imageRender";
import type { ImageDesign } from "@/lib/settings";
import type { ImageItem } from "@/lib/store";

export const illustrationKey = (id: string) => `ill:${id}`;

/** 이미지 항목을 렌더링한 PNG의 object URL. 문구·디자인·일러스트가 바뀌면 다시 그린다. */
export function useRendered(item: ImageItem | undefined, design: ImageDesign) {
  const [url, setUrl] = useState<string | null>(null);
  const sig = item ? JSON.stringify([item.copy, item.layout, item.illustration, item.updatedAt, design]) : "";

  useEffect(() => {
    if (!item) return;
    let alive = true;
    let made: string | null = null;
    (async () => {
      const blob = await renderBlob(item, design);
      if (!alive) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    })().catch(() => alive && setUrl(null));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return url;
}

/** gif: 마지막 이미지는 움짤로 내보낸다(exporter.isAnimated). */
export async function renderBlob(item: ImageItem, design: ImageDesign, gif = false): Promise<Blob> {
  const [illustration, logo] = await Promise.all([
    item.illustration === "ready"
      ? idbGet(illustrationKey(item.id)).then((d) => (d ? loadImage(d) : null))
      : Promise.resolve(null),
    design.logo ? loadImage(design.logo).catch(() => null) : Promise.resolve(null),
  ]);
  // 실사 사진은 필름 마감으로 AI 광택을 덜어낸다(문서마다 시드 고정)
  const finished = illustration && design.illustrationStyle === "photo" ? photoFinish(illustration, [...item.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)) : illustration;
  const canvas = await renderImage({
    kind: item.kind,
    copy: item.copy,
    design: variantDesign(item.kind, item.sectionIndex, design),
    layout: item.layout ?? autoLayout(item.kind, item.sectionIndex, design, item.copy),
    illustration: finished,
    logo,
  });
  return gif ? toGif(canvas) : canvasToBlob(canvas);
}
