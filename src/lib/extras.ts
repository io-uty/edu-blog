// 움짤(GIF). 브라우저 캔버스로만 만든다(AI 호출 없음). 브라우저 전용.
import { GIFEncoder, applyPalette, quantize } from "gifenc";

/** 완성된 이미지를 천천히 확대·축소하는 반복 GIF로 만든다. 네이버 업로드 용량을 생각해 640px·12장. */
export function toGif(src: HTMLCanvasElement, size = 640, frames = 12): Blob {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const gif = GIFEncoder();
  let palette: number[][] | null = null;
  for (let i = 0; i < frames; i++) {
    const s = 1 + 0.045 * Math.sin((Math.PI * i) / frames); // 1 → 1.045 → 1, 끊김 없이 반복
    const d = size * s;
    ctx.drawImage(src, (size - d) / 2, (size - d) / 2, d, d);
    const { data } = ctx.getImageData(0, 0, size, size);
    palette ??= quantize(data, 256); // 첫 장 팔레트를 공유해 색 깜빡임을 막는다
    gif.writeFrame(applyPalette(data, palette), size, size, { palette, delay: 110 });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}
