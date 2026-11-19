"use client";

import { useEffect, useState } from "react";
import { idbGet } from "@/lib/idb";
import { autoLayout, canvasToBlob, loadImage, renderImage, variantDesign } from "@/lib/imageRender";
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

export async function renderBlob(item: ImageItem, design: ImageDesign): Promise<Blob> {
  const [illustration, logo] = await Promise.all([
    item.illustration === "ready"
      ? idbGet(illustrationKey(item.id)).then((d) => (d ? loadImage(d) : null))
      : Promise.resolve(null),
    design.logo ? loadImage(design.logo).catch(() => null) : Promise.resolve(null),
  ]);
  const canvas = await renderImage({
    kind: item.kind,
    copy: item.copy,
    design: variantDesign(item.kind, item.sectionIndex, design),
    layout: item.layout ?? autoLayout(item.kind, item.sectionIndex, design, item.copy),
    illustration,
    logo,
  });
  return canvasToBlob(canvas);
}
