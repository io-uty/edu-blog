// 움짤(GIF)과 인사 스티커. 둘 다 브라우저 캔버스로만 만든다(AI 호출 없음). 브라우저 전용.
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { canvasToBlob } from "./imageRender";
import type { ImageDesign } from "./settings";

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

const GREETINGS = ["안녕하세요!", "반가워요!", "어서오세요~", "오늘도 화이팅!", "좋은 하루예요!", "Hello!"];
const FACES = ["👋", "😊", "🙌", "✨", "📚", "💛"];

/** 글 맨 위에 넣는 인사 스티커. seed(문서 id)마다 문구·이모지·색이 달라지고, 같은 글에서는 늘 같다. */
export function greetingSticker(seed: string, design: ImageDesign): Promise<Blob> {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const text = GREETINGS[h % GREETINGS.length];
  const face = FACES[(h >>> 4) % FACES.length];
  const fill = [design.accent, design.point, design.primary][(h >>> 8) % 3];
  const W = 520, H = 300;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(((h % 7) - 3) * 0.012); // 살짝 기울여 붙인 스티커 느낌
  // 흰 테두리 + 색 말풍선
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.roundRect(-230, -110, 460, 200, 100);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-218, -98, 436, 176, 88);
  ctx.moveTo(-40, 76);
  ctx.lineTo(-70, 118);
  ctx.lineTo(0, 78);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillText(face, 0, -40);
  const n = parseInt(fill.slice(1), 16);
  const light = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
  ctx.fillStyle = light ? "#1F2937" : "#ffffff"; // 밝은 강조색(노랑 등) 위에서는 어두운 글자
  ctx.font = '800 50px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
  ctx.fillText(text, 0, 34);
  ctx.restore();
  return canvasToBlob(c);
}
