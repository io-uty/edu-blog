"use client";

import { useEffect } from "react";
import { cursorUrl } from "@/lib/pixelCursor";
import { burst } from "@/lib/pixelFx";

// 전역 뚝딱 인터랙션: 픽셀 커서(기본·호버·누름)와 버튼을 누를 때 작은 도트 효과.
const CLICKABLE = "button:not(:disabled), a[href], [role='button'], summary, label[for]";

export default function PixelFx() {
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--cur", `${cursorUrl()}, auto`);
    root.setProperty("--cur-hover", `${cursorUrl({ px: 1.75, sparkle: true })}, pointer`);
    root.setProperty("--cur-press", `${cursorUrl({ px: 1.75, sparkle: true, squash: true })}, pointer`);

    const down = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (t && !t.closest("[data-no-fx]")) burst(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", down, { passive: true });
    return () => window.removeEventListener("pointerdown", down);
  }, []);
  return null;
}
