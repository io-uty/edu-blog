// 1:1 블로그 이미지를 Canvas로 그린다. 글자·로고·체크 항목은 모두 코드로 렌더링하고,
// 일러스트(선택)는 이미지로 받아 배치만 한다. 브라우저 전용.
import type { ImageCopy, ImageKind } from "./imageCopy";
import type { ImageDesign, ImageLayout } from "./settings";

export const SIZE = 1080;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';
const M = 64; // 바깥 여백

export interface RenderInput {
  kind: ImageKind;
  copy: ImageCopy;
  design: ImageDesign;
  layout: ImageLayout;
  illustration?: HTMLImageElement | null;
  logo?: HTMLImageElement | null;
}

type Ctx = CanvasRenderingContext2D;

// ---------- 공용 도구 ----------

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function ensureFonts(text: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    [900, 800, 700].map((w) => document.fonts.load(`${w} 80px "Pretendard Variable"`, text).catch(() => [])),
  );
}

const font = (w: number, size: number) => `${w} ${size}px ${FONT}`;

/** maxW 안에 들어가는 가장 큰 글자 크기 */
function fit(ctx: Ctx, text: string, weight: number, maxW: number, max: number, min: number) {
  let s = max;
  for (; s > min; s -= 2) {
    ctx.font = font(weight, s);
    if (ctx.measureText(text).width <= maxW) break;
  }
  ctx.font = font(weight, s);
  return s;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function luminance(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return 1;
  const [r, g, b] = m.slice(0, 3).map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (bg: string) => (luminance(bg) > 0.55 ? "#111111" : "#FFFFFF");

function seeded(seed: number) {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function hashStr(t: string) {
  let h = 7;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** 붓으로 칠한 듯한 강조 띠 */
function brush(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, seed: number) {
  const rnd = seeded(seed);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const steps = 8;
  ctx.moveTo(x + rnd() * 18, y + rnd() * 10);
  for (let i = 1; i <= steps; i++) ctx.lineTo(x + (w * i) / steps, y + (rnd() - 0.5) * 12);
  ctx.lineTo(x + w + 14 + rnd() * 14, y + h * 0.5);
  for (let i = steps; i >= 0; i--) ctx.lineTo(x + (w * i) / steps, y + h + (rnd() - 0.5) * 12);
  ctx.lineTo(x - 14 - rnd() * 12, y + h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 외곽선 + 채움 글자 */
function outlined(ctx: Ctx, text: string, x: number, y: number, fill: string, stroke: string | null, lw: number) {
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 이미지를 영역에 cover로 채우고, 가장자리를 배경 쪽으로 부드럽게 사라지게 한다. */
function drawFaded(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number, fade: "left" | "left-top" | "none") {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const o = off.getContext("2d")!;
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  o.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  if (fade !== "none") {
    o.globalCompositeOperation = "destination-in";
    const g = o.createLinearGradient(0, 0, w * 0.35, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    o.fillStyle = g;
    o.fillRect(0, 0, w, h);
    if (fade === "left-top") {
      const g2 = o.createLinearGradient(0, 0, 0, h * 0.3);
      g2.addColorStop(0, "rgba(0,0,0,0)");
      g2.addColorStop(1, "rgba(0,0,0,1)");
      o.fillStyle = g2;
      o.fillRect(0, 0, w, h);
    }
  }
  ctx.drawImage(off, x, y);
}

function drawLogoLine(ctx: Ctx, d: ImageDesign, logo: HTMLImageElement | null | undefined, x: number, cy: number, color: string, align: "left" | "center") {
  const lh = 50;
  const lw = logo ? (logo.width / logo.height) * lh : 0;
  ctx.font = font(700, 36);
  const tw = d.label ? ctx.measureText(d.label).width : 0;
  const gap = logo && d.label ? 44 : 0;
  const total = lw + gap + tw;
  let cx = align === "center" ? x - total / 2 : x;
  if (logo) {
    ctx.drawImage(logo, cx, cy - lh / 2, lw, lh);
    cx += lw;
  }
  if (logo && d.label) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cx + gap / 2 - 1.5, cy - 22, 3, 44);
    ctx.globalAlpha = 1;
    cx += gap;
  }
  if (d.label) {
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(d.label, cx, cy + 2);
    ctx.textBaseline = "alphabetic";
  }
}

function pill(ctx: Ctx, text: string, x: number, y: number, size: number, bg: string, fg: string, border: string | null, weight = 800) {
  ctx.font = font(weight, size);
  const w = ctx.measureText(text).width + size * 1.3;
  const h = size * 1.75;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size * 0.65, y + h / 2 + size * 0.04);
  ctx.textBaseline = "alphabetic";
  return { w, h };
}

function checkIcon(ctx: Ctx, cx: number, cy: number, r: number, circle: string, mark: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = circle;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.38);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
  ctx.lineWidth = r * 0.26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = mark;
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** 제목 줄들을 그린다. 반환: 마지막 줄 아래 y */
function titleBlock(
  ctx: Ctx,
  c: ImageCopy,
  d: ImageDesign,
  x: number,
  top: number,
  maxW: number,
  style: "outline" | "brush",
  maxSize: number,
  maxH = Infinity,
) {
  const lines = c.title.filter(Boolean).slice(0, 3);
  // 줄 수에 맞춰 전체 크기를 정하고(남은 높이 안), 각 줄은 maxW 안에 맞춘다
  const byCount = lines.length >= 3 ? maxSize * 0.78 : lines.length === 2 ? maxSize : maxSize * 1.1;
  const base = Math.max(56, Math.min(byCount, maxH / (Math.max(1, lines.length) * 1.16)));
  let y = top;
  lines.forEach((line, i) => {
    const s = fit(ctx, line, 900, maxW, base, 56);
    const lh = s * 1.16;
    y += s;
    const hi = i === c.highlight;
    if (style === "outline") {
      if (hi) outlined(ctx, line, x, y, d.accent, d.primary, s * 0.16);
      else outlined(ctx, line, x, y, d.primary, "#FFFFFF", s * 0.1);
    } else {
      if (hi) {
        const w = ctx.measureText(line).width;
        brush(ctx, x - 10, y - s * 0.86, w + 20, s * 0.98, d.accent, hashStr(line));
      }
      ctx.font = font(900, s);
      ctx.fillStyle = d.primary;
      ctx.fillText(line, x, y);
    }
    y += lh - s;
  });
  return y;
}

// ---------- 레이아웃 ----------

function layoutHeadline(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const footerH = d.footer ? 150 : 0;
  const H = SIZE - footerH;
  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (r.illustration) {
    drawFaded(ctx, r.illustration, Math.round(SIZE * 0.3), Math.round(SIZE * 0.16), Math.round(SIZE * 0.7), Math.round(H - SIZE * 0.16), "left-top");
  } else {
    // 일러스트가 없을 때의 단순 장식
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = d.primary;
    ctx.beginPath();
    ctx.arc(SIZE - 120, H - 60, 330, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 강조선(삐침)
  ctx.save();
  ctx.strokeStyle = d.primary;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  [[-0.35, 0], [0, 1], [0.35, 2]].forEach(([a], i) => {
    const bx = SIZE - 150 + i * 34;
    const by = 70 + Math.abs(i - 1) * 14;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 18 + a * 30, by + 56);
    ctx.stroke();
  });
  ctx.restore();

  let y = M + 6;
  if (c.eyebrow) {
    const p = pill(ctx, c.eyebrow, M, y, 52, d.primary, "#FFFFFF", null, 900);
    // 말풍선 꼬리
    ctx.beginPath();
    ctx.moveTo(M + 46, y + p.h - 2);
    ctx.lineTo(M + 40, y + p.h + 30);
    ctx.lineTo(M + 86, y + p.h - 2);
    ctx.fillStyle = d.primary;
    ctx.fill();
    y += p.h + 42;
  }
  const ptsCount = Math.min(3, c.points.filter(Boolean).length);
  const reserve = (c.sub ? 122 : 0) + (ptsCount ? ptsCount * 92 + 30 + 20 : 0) + 40;
  y = titleBlock(ctx, c, d, M, y, SIZE - M * 2, "outline", 168, H - y - reserve);
  y += 26;
  if (c.sub) {
    ctx.font = font(800, 50);
    const s = fit(ctx, c.sub, 800, SIZE - M * 2 - 70, 50, 34);
    const p = pill(ctx, c.sub, M, y, s, "#FFFFFF", d.primary, d.primary);
    y += p.h + 34;
  }
  // 체크 카드: 일러스트가 있으면 왼쪽 좁은 카드, 없으면 넓게
  const pts = c.points.filter(Boolean).slice(0, 3);
  if (pts.length) {
    const cardW = r.illustration ? SIZE * 0.44 : SIZE - M * 2;
    const rowH = 92;
    const avail = H - y - 40;
    const rows = Math.min(pts.length, Math.max(0, Math.floor((avail - 30) / rowH)));
    if (rows > 0) {
      rr(ctx, M, y, cardW, rows * rowH + 30, 26);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
      pts.slice(0, rows).forEach((t, i) => {
        const cy = y + 15 + rowH * i + rowH / 2;
        checkIcon(ctx, M + 52, cy, 28, d.accent, d.primary);
        fit(ctx, t, 800, cardW - 130, 42, 26);
        ctx.fillStyle = d.primary;
        ctx.textBaseline = "middle";
        ctx.fillText(t, M + 100, cy + 2);
        ctx.textBaseline = "alphabetic";
        if (i < rows - 1) {
          ctx.fillStyle = "rgba(0,0,0,0.08)";
          ctx.fillRect(M + 30, y + 15 + rowH * (i + 1), cardW - 60, 2);
        }
      });
    }
  }
  if (d.footer) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, H, SIZE, footerH);
    drawLogoLine(ctx, d, r.logo, SIZE / 2, H + footerH / 2, "#222222", "center");
  }
}

function layoutNotice(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  // 흰 배경 + 아래쪽 물결
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const g = ctx.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, d.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, SIZE * 0.55, SIZE, SIZE * 0.45);
  ctx.beginPath();
  ctx.moveTo(0, SIZE * 0.86);
  ctx.bezierCurveTo(SIZE * 0.3, SIZE * 0.78, SIZE * 0.7, SIZE * 0.95, SIZE, SIZE * 0.7);
  ctx.lineTo(SIZE, SIZE);
  ctx.lineTo(0, SIZE);
  ctx.closePath();
  ctx.fillStyle = d.bg;
  ctx.fill();

  if (r.illustration) {
    drawFaded(ctx, r.illustration, Math.round(SIZE * 0.5), 20, Math.round(SIZE * 0.5), Math.round(SIZE * 0.62), "left");
  }

  drawLogoLine(ctx, d, r.logo, M, M + 10, "#222222", "left");
  let y = M + 80;
  if (c.eyebrow) {
    const p = pill(ctx, c.eyebrow, M + 30, y, 58, d.primary, "#FFFFFF", null, 900);
    y += p.h + 20;
  }
  const maxW = r.illustration ? SIZE * 0.62 : SIZE - M * 2;
  y = titleBlock(ctx, c, d, M + 10, y, maxW, "brush", 150);
  y += 18;
  if (c.sub) {
    const s = fit(ctx, c.sub, 900, SIZE - M * 2 - 20, 78, 40);
    ctx.fillStyle = d.point;
    ctx.fillText(c.sub, M + 10, y + s);
    const w = ctx.measureText(c.sub).width;
    // 밑줄 스우시
    ctx.beginPath();
    ctx.moveTo(M + 10, y + s + 30);
    ctx.quadraticCurveTo(M + 10 + w * 0.5, y + s + 14, M + 10 + w + 30, y + s + 26);
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.strokeStyle = d.point;
    ctx.stroke();
    ctx.lineCap = "butt";
    y += s + 50;
  }
  // 하단 안내 박스
  const pts = c.points.filter(Boolean).slice(0, 2);
  if (pts.length) {
    const bh = 220;
    const by = Math.max(y + 20, SIZE - M - bh);
    if (by + bh <= SIZE - 20) {
      rr(ctx, M, by, SIZE - M * 2, bh, bh / 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 12;
      ctx.strokeStyle = d.accent;
      ctx.stroke();
      // 달력 아이콘
      const ix = M + 70;
      const iy = by + bh / 2 - 52;
      rr(ctx, ix, iy, 112, 104, 18);
      ctx.lineWidth = 9;
      ctx.strokeStyle = d.primary;
      ctx.stroke();
      ctx.fillStyle = d.primary;
      ctx.fillRect(ix, iy, 112, 26);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) ctx.fillRect(ix + 22 + b * 26, iy + 44 + a * 26, 14, 14);
      ctx.fillRect(ix + 112 + 40, by + 50, 4, bh - 100);
      const tx = ix + 112 + 80;
      const tw = SIZE - M - 60 - tx;
      if (pts.length === 1) {
        fit(ctx, pts[0], 900, tw, 70, 34);
        ctx.fillStyle = d.primary;
        ctx.textBaseline = "middle";
        ctx.fillText(pts[0], tx, by + bh / 2 + 3);
      } else {
        fit(ctx, pts[0], 700, tw, 44, 28);
        ctx.fillStyle = d.primary;
        ctx.textBaseline = "middle";
        ctx.fillText(pts[0], tx, by + bh / 2 - 44);
        fit(ctx, pts[1], 900, tw, 76, 34);
        ctx.fillText(pts[1], tx, by + bh / 2 + 32);
      }
      ctx.textBaseline = "alphabetic";
    }
  }
}

function layoutChecklist(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const bandH = d.footer ? 130 : 0;

  if (r.illustration) {
    drawFaded(ctx, r.illustration, Math.round(SIZE * 0.6), 0, Math.round(SIZE * 0.4), Math.round(SIZE * 0.42), "left");
  }
  const topColor = onColor(d.bg) === "#111111" ? "#222222" : "#FFFFFF";
  // 하단 띠에 이름이 들어가면 위쪽에는 로고만 둔다(중복 방지)
  drawLogoLine(ctx, d.footer ? { ...d, label: "" } : d, r.logo, M, 70, topColor, "left");

  // 스프링 노트 카드 — 제목이 최소 크기(약 104px) 밑으로 줄면 체크 항목을 덜어낸다
  const pillH = 92;
  const cardX = 40;
  const cardY = 140;
  const cardW = SIZE - 80;
  const lineCount = Math.max(1, c.title.filter(Boolean).length);
  const eyebrowH = c.eyebrow ? 62 + 16 : 0;
  const subH = c.sub ? 100 : 0;
  const pts = c.points.filter(Boolean).slice(0, 3);
  const cardHFor = (n: number) => SIZE - cardY - bandH - 50 - (n ? 30 + n * (pillH + 16) : 0);
  while (pts.length && (cardHFor(pts.length) - 60 - eyebrowH - subH - 40) / (lineCount * 1.16) < 104) pts.pop();
  const cardH = cardHFor(pts.length);
  ctx.save();
  ctx.translate(SIZE / 2, cardY + cardH / 2);
  ctx.rotate(-0.012);
  ctx.translate(-SIZE / 2, -(cardY + cardH / 2));
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  rr(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 5;
  ctx.strokeStyle = d.primary;
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const hx = cardX + 90 + i * ((cardW - 180) / 6);
    ctx.beginPath();
    ctx.arc(hx, cardY + 16, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#999999";
    ctx.fill();
    rr(ctx, hx - 6, cardY - 30, 12, 50, 6);
    ctx.fillStyle = "#BBBBBB";
    ctx.fill();
  }
  let y = cardY + 60;
  if (c.eyebrow) {
    const s = fit(ctx, c.eyebrow, 800, cardW - 140, 62, 36);
    ctx.fillStyle = d.primary;
    ctx.fillText(c.eyebrow, cardX + 70, y + s);
    y += s + 16;
  }
  y = titleBlock(ctx, c, d, cardX + 70, y, cardW - 140, "brush", 150, cardY + cardH - y - subH - 40);
  if (c.sub) {
    const s = fit(ctx, c.sub, 900, cardW - 140, 72, 40);
    if (y + s + 20 < cardY + cardH) {
      ctx.fillStyle = d.point;
      ctx.fillText(c.sub, cardX + 70, y + s + 6);
    }
  }
  ctx.restore();

  // 체크 알약
  let py = cardY + cardH + 30;
  pts.forEach((t) => {
    const ph = pillH;
    if (py + ph > SIZE - bandH - 20) return;
    const pw = SIZE * 0.66;
    rr(ctx, M, py, pw, ph, ph / 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = d.primary;
    ctx.stroke();
    checkIcon(ctx, M + 58, py + ph / 2, 30, d.primary, "#FFFFFF");
    fit(ctx, t, 900, pw - 140, 50, 28);
    ctx.fillStyle = d.primary;
    ctx.textBaseline = "middle";
    ctx.fillText(t, M + 108, py + ph / 2 + 2);
    ctx.textBaseline = "alphabetic";
    py += ph + 16;
  });

  if (d.footer) {
    ctx.fillStyle = d.primary;
    ctx.beginPath();
    ctx.moveTo(0, SIZE - bandH + 20);
    ctx.lineTo(SIZE, SIZE - bandH - 20);
    ctx.lineTo(SIZE, SIZE);
    ctx.lineTo(0, SIZE);
    ctx.closePath();
    ctx.fill();
    drawLogoLine(ctx, { ...d }, null, M, SIZE - bandH / 2 + 8, "#FFFFFF", "left");
  }
}

// ---------- 진입점 ----------

export async function renderImage(r: RenderInput): Promise<HTMLCanvasElement> {
  await ensureFonts([r.copy.eyebrow, ...r.copy.title, r.copy.sub, ...r.copy.points, r.design.label].join(""));
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  if (r.layout === "notice") layoutNotice(ctx, r);
  else if (r.layout === "checklist") layoutChecklist(ctx, r);
  else layoutHeadline(ctx, r);
  return canvas;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), "image/png"));
}

/** 업로드한 로고를 최대 높이 maxH로 줄여 dataURL로 만든다(브라우저 저장 용량 절약). */
export async function shrinkImage(file: File, maxH = 160): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxH / img.height);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
