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
  illustration?: Pic | null;
  logo?: HTMLImageElement | null;
}

type Ctx = CanvasRenderingContext2D;
type Pic = HTMLImageElement | HTMLCanvasElement;

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

/**
 * 생성 사진의 'AI 광택'을 걷어내는 필름 마감: 채도 10%↓, 검정을 살짝 띄우고(매트), 아주 약한 웜톤, 고운 그레인.
 * 그림에만 적용하고 글자·로고에는 적용하지 않는다. 같은 이미지는 늘 같은 결과(시드 고정).
 */
export function photoFinish(img: Pic, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const p = im.data;
  const rnd = seeded(seed);
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const n = (rnd() + rnd() - 1) * 14;
    p[i] = 11 + 0.93 * (l + (p[i] - l) * 0.9) + n;
    p[i + 1] = 8 + 0.93 * (l + (p[i + 1] - l) * 0.9) + n;
    p[i + 2] = 5 + 0.93 * (l + (p[i + 2] - l) * 0.9) + n;
  }
  ctx.putImageData(im, 0, 0);
  return c;
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
function drawFaded(ctx: Ctx, img: Pic, x: number, y: number, w: number, h: number, fade: "left" | "left-top" | "none") {
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

// ---------- 이미지마다 달라지는 요소 ----------

/** 주제(제목)에 따라 다른 작은 무늬(점·별·고리·반짝이)를 가장자리에 흩뿌린다 */
function decorate(ctx: Ctx, r: RenderInput, maxY: number) {
  const d = r.design;
  const rnd = seeded(hashStr(r.copy.title.join("|") + r.kind + (r.copy.eyebrow ?? "")));
  const motif = Math.floor(rnd() * 4);
  const colors = [d.primary, d.point, d.accent];
  ctx.save();
  for (let i = 0; i < 9; i++) {
    // 글자가 많은 왼쪽 위를 피해 오른쪽·아래쪽 가장자리에 둔다
    const edge = rnd();
    const x = edge < 0.5 ? SIZE * (0.62 + rnd() * 0.34) : SIZE * (0.05 + rnd() * 0.9);
    const y = edge < 0.5 ? maxY * (0.08 + rnd() * 0.85) : maxY * (0.86 + rnd() * 0.12);
    const s = 10 + rnd() * 18;
    ctx.globalAlpha = 0.35 + rnd() * 0.3;
    ctx.fillStyle = ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (motif === 0) {
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (motif === 1) {
      for (let k = 0; k < 10; k++) {
        const a = (Math.PI / 5) * k - Math.PI / 2;
        const rr2 = k % 2 ? s * 0.45 : s;
        ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      ctx.closePath();
      ctx.fill();
    } else if (motif === 2) {
      ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x, y, x, y - s);
      ctx.quadraticCurveTo(x, y, x + s, y);
      ctx.quadraticCurveTo(x, y, x, y + s);
      ctx.quadraticCurveTo(x, y, x - s, y);
      ctx.fill();
    }
  }
  ctx.restore();
}

function mix(a: string, b: string, t: number) {
  const pa = a.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  const pb = b.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  return "#" + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0")).join("");
}

/** 레이아웃을 직접 고르지 않았으면: 썸네일은 기본 레이아웃, 소주제는 AI가 정한 종류(그림형/내용정리형) */
export function autoLayout(kind: ImageKind, sectionIndex: number | null, design: ImageDesign, copy?: ImageCopy): ImageLayout {
  void sectionIndex;
  if (kind === "thumbnail") return design.layout;
  return copy?.visual === "card" ? "summary" : "scene";
}

/** 학원 색 안에서 이미지마다 배경 톤을 바꾼다(썸네일은 원래 색) */
export function variantDesign(kind: ImageKind, sectionIndex: number | null, d: ImageDesign): ImageDesign {
  if (kind === "thumbnail") return d;
  const v = (sectionIndex ?? 0) % 3;
  if (v === 0) return { ...d, bg: mix(d.bg, "#ffffff", 0.55) };
  if (v === 1) return { ...d, bg: mix(d.primary, "#ffffff", 0.9) };
  return { ...d, bg: mix(d.accent, "#ffffff", 0.3) };
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
    // 일러스트가 없을 때: 주제마다 다른 큰 도형 + 작은 무늬
    const rnd = seeded(hashStr(c.title.join("") + c.eyebrow));
    const spots = [
      [SIZE - 120, H - 60],
      [SIZE - 80, 260],
      [140, H - 40],
    ];
    const [cx, cy] = spots[Math.floor(rnd() * spots.length)];
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = rnd() > 0.5 ? d.primary : d.point;
    ctx.beginPath();
    ctx.arc(cx, cy, 260 + rnd() * 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  decorate(ctx, r, H);
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

  decorate(ctx, r, SIZE * 0.55);
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

  decorate(ctx, r, SIZE - bandH);
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

/** 글자가 maxW 를 넘으면 …로 줄인다 */
function ellipsize(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** 소주제 내용 정리 카드: 제목 + 번호 붙은 핵심 항목과 한 줄 설명. 부드러운 카드 스타일 */
function layoutSummary(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const bandH = d.footer ? 120 : 0;
  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 배경: 모서리에 걸친 큰 원 두 개로 깊이감
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = mix(d.accent, "#ffffff", 0.55);
  ctx.beginPath();
  ctx.arc(SIZE - 40, 40, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = mix(d.primary, "#ffffff", 0.8);
  ctx.beginPath();
  ctx.arc(60, SIZE - bandH - 20, 240, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const dark = "#1c1c28";
  drawLogoLine(ctx, d.footer ? { ...d, label: "" } : d, r.logo, M, 66, onColor(d.bg) === "#111111" ? "#333333" : "#FFFFFF", "left");

  // 머리: 배지 + 큰 제목 + 한 줄 요약
  const illS = r.illustration ? 230 : 0;
  const textW = SIZE - M * 2 - (illS ? illS + 24 : 0);
  let y = 112;
  if (c.eyebrow) {
    const p = pill(ctx, c.eyebrow, M, y, 36, d.primary, "#FFFFFF", null);
    y += p.h + 18;
  }
  const subH = c.sub ? 62 : 0;
  y = titleBlock(ctx, c, d, M, y, textW, "brush", 100, Math.max(120, 372 - y - subH));
  if (c.sub) {
    const s = fit(ctx, c.sub, 800, textW, 40, 28);
    ctx.fillStyle = d.point;
    ctx.fillText(c.sub, M, y + s + 8);
    y += s + 16;
  }
  if (illS && r.illustration) {
    const ix = SIZE - M - illS;
    const iy = 112;
    ctx.save();
    rr(ctx, ix, iy, illS, illS, 40);
    ctx.clip();
    const sc = Math.max(illS / r.illustration.width, illS / r.illustration.height);
    const dw = r.illustration.width * sc;
    const dh = r.illustration.height * sc;
    ctx.drawImage(r.illustration, ix + (illS - dw) / 2, iy + (illS - dh) / 2, dw, dh);
    ctx.restore();
    y = Math.max(y, iy + illS);
  }

  // 핵심 항목 카드(왼쪽 색 띠 + 둥근 번호 + 제목/설명)
  const rows = (c.items && c.items.length ? c.items.filter((i) => i.label) : c.points.filter(Boolean).map((p) => ({ label: p, detail: "" }))).slice(0, 4);
  const top = Math.max(y + 26, 390);
  const bottom = SIZE - bandH - (d.footer ? 36 : 60);
  const gap = 18;
  const rowH = Math.min(172, (bottom - top - gap * (rows.length - 1)) / Math.max(1, rows.length));
  rows.forEach((it, i) => {
    const ry = top + i * (rowH + gap);
    const tone = i % 2 ? d.point : d.primary;
    ctx.save();
    ctx.shadowColor = "rgba(20,20,40,0.10)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    rr(ctx, M, ry, SIZE - M * 2, rowH, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, M, ry, SIZE - M * 2, rowH, 32);
    ctx.clip();
    ctx.fillStyle = tone;
    ctx.fillRect(M, ry, 16, rowH);
    ctx.restore();

    const bs = Math.min(76, rowH * 0.5);
    const bx = M + 16 + 28;
    const by = ry + (rowH - bs) / 2;
    rr(ctx, bx, by, bs, bs, bs * 0.32);
    ctx.fillStyle = mix(tone, "#ffffff", 0.86);
    ctx.fill();
    ctx.fillStyle = tone;
    ctx.font = font(900, bs * 0.58);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), bx + bs / 2, by + bs / 2 + bs * 0.04);
    ctx.textAlign = "left";

    const tx = bx + bs + 26;
    const tw = SIZE - M - 30 - tx;
    if (it.detail) {
      const ls = fit(ctx, it.label, 900, tw, Math.min(46, rowH * 0.3), 28);
      const ds = Math.min(32, Math.max(23, rowH * 0.2));
      const total = ls + 12 + ds;
      const t0 = ry + (rowH - total) / 2;
      ctx.fillStyle = dark;
      ctx.fillText(ellipsize(ctx, it.label, tw), tx, t0 + ls * 0.88);
      ctx.font = font(600, ds);
      ctx.fillStyle = "#5a5a6a";
      ctx.fillText(ellipsize(ctx, it.detail, tw), tx, t0 + ls + 12 + ds * 0.88);
    } else {
      const ls = fit(ctx, it.label, 900, tw, Math.min(52, rowH * 0.34), 30);
      ctx.fillStyle = dark;
      ctx.fillText(ellipsize(ctx, it.label, tw), tx, ry + rowH / 2 + ls * 0.36);
    }
    ctx.textBaseline = "alphabetic";
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

// ---------- 포스터형(썸네일 기본) ----------

function rgba(hex: string, a: number) {
  const m = hex.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}

function drawCover(ctx: Ctx, img: Pic) {
  const sc = Math.max(SIZE / img.width, SIZE / img.height);
  ctx.drawImage(img, (SIZE - img.width * sc) / 2, (SIZE - img.height * sc) / 2, img.width * sc, img.height * sc);
}

/** 제목 옆 반짝 강조선(세 줄) */
function sparks(ctx: Ctx, cx: number, cy: number, dir: -1 | 1, color: string, len = 46) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  [-0.7, 0, 0.7].forEach((a, i) => {
    const ang = (dir === -1 ? Math.PI : 0) + a * dir;
    const r0 = i === 1 ? 0 : 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
    ctx.stroke();
  });
  ctx.restore();
}

/** 하단 가운데 학원 표기(로고 + 이름 + 상담 문구) */
function bottomBadge(ctx: Ctx, d: ImageDesign, logo: HTMLImageElement | null | undefined, onPhoto: boolean) {
  const text = d.label.trim();
  if (!text && !logo) return;
  const lh = 44;
  const lw = logo ? (logo.width / logo.height) * lh : 0;
  ctx.font = font(800, 34);
  const tw = text ? ctx.measureText(text).width : 0;
  const gap = logo && text ? 16 : 0;
  const w = lw + gap + tw + 64;
  const h = 76;
  const x = (SIZE - w) / 2;
  const y = SIZE - h - 40;
  ctx.save();
  if (onPhoto) {
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
  }
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.restore();
  let cx = x + 32;
  if (logo) {
    ctx.drawImage(logo, cx, y + (h - lh) / 2, lw, lh);
    cx += lw + gap;
  }
  if (text) {
    ctx.fillStyle = "#1b1f2a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, y + h / 2 + 2);
    ctx.textBaseline = "alphabetic";
  }
}

/** 실사·3D 사진 위에 큰 제목. 위쪽은 배경색으로 부드럽게 바래 글자 자리를 만든다. */
function layoutPoster(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const ill = r.illustration!;
  const thumb = r.kind === "thumbnail";
  const paper = mix(d.bg, "#ffffff", 0.55);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawCover(ctx, ill);

  const lines = c.title.filter(Boolean).slice(0, 3);
  const maxW = SIZE - 150;
  const base = thumb ? (lines.length >= 3 ? 118 : 138) : lines.length >= 3 ? 96 : 112;
  const sizes = lines.map((l) => fit(ctx, l, 900, maxW, base, 60));
  const eyebrowH = c.eyebrow && !thumb ? 76 : 0;
  const subH = c.sub ? 92 : 0;
  const blockH = 70 + eyebrowH + sizes.reduce((a, s) => a + s * 1.16, 0) + subH;

  // 글자 자리: 위쪽을 종이색으로 덮고 아래로 갈수록 사진이 드러나게
  const fadeEnd = Math.min(SIZE * 0.78, blockH + 170);
  const g = ctx.createLinearGradient(0, 0, 0, fadeEnd);
  g.addColorStop(0, rgba(paper, 0.97));
  g.addColorStop(Math.max(0.05, (blockH - 30) / fadeEnd), rgba(paper, 0.88));
  g.addColorStop(1, rgba(paper, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, fadeEnd);

  const ink = luminance(d.primary) < 0.35 ? d.primary : "#141b34";
  let y = 70;
  if (eyebrowH) {
    ctx.font = font(800, 34);
    const w = ctx.measureText(c.eyebrow).width + 48;
    pill(ctx, c.eyebrow, (SIZE - w) / 2, y, 34, ink, "#FFFFFF", null);
    y += eyebrowH;
  }
  ctx.textAlign = "center";
  let firstTop = y;
  lines.forEach((line, i) => {
    const s = sizes[i];
    ctx.font = font(900, s);
    y += s;
    if (i === 0) firstTop = y - s;
    const hi = i === c.highlight;
    const w = ctx.measureText(line).width;
    if (hi) brush(ctx, SIZE / 2 - w / 2 - 6, y - s * 0.34, w + 12, s * 0.36, rgba(d.accent, 0.9), hashStr(line));
    ctx.font = font(900, s);
    outlined(ctx, line, SIZE / 2, y, hi ? d.point : ink, rgba(paper, 0.9), s * 0.08);
    y += s * 0.16;
  });
  const widest = Math.max(...lines.map((l, i) => (ctx.font = font(900, sizes[i]), ctx.measureText(l).width)));
  if (thumb && widest / 2 + 34 + 56 < SIZE / 2 - 16) {
    sparks(ctx, SIZE / 2 - widest / 2 - 34, firstTop + 30, -1, d.accent);
    sparks(ctx, SIZE / 2 + widest / 2 + 34, firstTop + 30, 1, d.accent);
  }
  if (c.sub) {
    y += 26;
    const s = fit(ctx, c.sub, 800, SIZE - 260, 44, 28);
    const w = ctx.measureText(c.sub).width + s * 1.6;
    const h = s * 1.8;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 16;
    rr(ctx, (SIZE - w) / 2, y, w, h, h / 2);
    ctx.fillStyle = mix(d.primary, "#ffffff", 0.86);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1b1f2a";
    ctx.textBaseline = "middle";
    ctx.fillText(c.sub, SIZE / 2, y + h / 2 + 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.textAlign = "left";
  if (thumb || d.footer) bottomBadge(ctx, d, r.logo, true);
}

const BOLD_GRADIENT = ["#EE7B78", "#F4CFC6", "#F2CBEF", "#A6EFB6", "#98D2F0"];

/** 단색(또는 어둡게 깐 사진) 배경 + 상단 상담 띠 + 그라데이션 외곽선 제목 */
function layoutBold(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  if (r.illustration) {
    drawCover(ctx, r.illustration);
    ctx.fillStyle = "rgba(10,12,20,0.38)";
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = d.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // 은은한 비네팅
    const v = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.75);
    v.addColorStop(0, "rgba(255,255,255,0.06)");
    v.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  // 상단 흰 띠: 학원명 + 상담 문구(없으면 배지 문구)
  const left = d.label.trim() || c.eyebrow;
  const right = (d.contact ?? "").trim();
  let top = 120;
  if (left || right) {
    const lsz = 58;
    ctx.font = font(900, lsz);
    const lw = left ? ctx.measureText(left).width : 0;
    const rw = right ? ctx.measureText(right).width : 0;
    const gap = left && right ? 24 : 0;
    let sz = lsz;
    const avail = SIZE - 200;
    if (lw + gap + rw > avail) sz = Math.max(30, Math.floor((lsz * avail) / (lw + gap + rw)));
    ctx.font = font(900, sz);
    const tw = (left ? ctx.measureText(left).width : 0) + gap + (right ? ctx.measureText(right).width : 0);
    const bw = tw + 90;
    const bh = sz * 1.75;
    const bx = (SIZE - bw) / 2;
    const by = 110;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(bx, by, bw, bh);
    ctx.textBaseline = "middle";
    let x = bx + 45;
    if (left) {
      ctx.fillStyle = luminance(d.primary) < 0.4 ? d.primary : "#1f4040";
      ctx.fillText(left, x, by + bh / 2 + 3);
      x += ctx.measureText(left).width + gap;
    }
    if (right) {
      ctx.fillStyle = d.point;
      ctx.fillText(right, x, by + bh / 2 + 3);
    }
    ctx.textBaseline = "alphabetic";
    top = by + bh + 50;
  }

  const lines = c.title.filter(Boolean).slice(0, 3);
  const subH = c.sub ? 110 : 0;
  const avail = SIZE - top - subH - 70;
  const base = Math.min(lines.length >= 3 ? 190 : 220, avail / (lines.length * 1.08));
  const sizes = lines.map((l) => fit(ctx, l, 900, SIZE - 170, base, 70));
  const total = sizes.reduce((a, s) => a + s * 1.08, 0);
  let y = top + Math.max(0, (avail - total) / 2);
  const g = ctx.createLinearGradient(0, y, 0, y + total);
  BOLD_GRADIENT.forEach((col, i) => g.addColorStop(i / (BOLD_GRADIENT.length - 1), col));
  ctx.textAlign = "center";
  lines.forEach((line, i) => {
    const s = sizes[i];
    y += s * 0.98;
    ctx.font = font(900, s);
    ctx.lineJoin = "round";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.strokeStyle = "#0b0b0f";
    ctx.lineWidth = s * 0.24;
    ctx.strokeText(line, SIZE / 2, y);
    ctx.restore();
    ctx.fillStyle = g;
    ctx.fillText(line, SIZE / 2, y);
    y += s * 0.1;
  });
  if (c.sub) {
    y += 40;
    const s = fit(ctx, c.sub, 900, SIZE - 260, 50, 30);
    const w = ctx.measureText(c.sub).width + s * 1.6;
    const h = s * 1.8;
    rr(ctx, (SIZE - w) / 2, y, w, h, h / 2);
    ctx.fillStyle = "#0b0b0f";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(c.sub, SIZE / 2, y + h / 2 + 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.textAlign = "left";
  if (r.logo && !d.label.trim()) bottomBadge(ctx, d, r.logo, !!r.illustration);
}

// ---------- 진입점 ----------

export async function renderImage(r: RenderInput): Promise<HTMLCanvasElement> {
  const itemText = (r.copy.items ?? []).flatMap((i) => [i.label, i.detail]);
  await ensureFonts([r.copy.eyebrow, ...r.copy.title, r.copy.sub, ...r.copy.points, ...itemText, r.design.label, r.design.contact ?? "", "0123456789-"].join(""));
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  if (r.layout === "poster" || (r.layout === "scene" && r.kind === "thumbnail")) {
    if (r.illustration) layoutPoster(ctx, r);
    else layoutBold(ctx, r);
  } else if (r.layout === "bold") layoutBold(ctx, r);
  else if (r.layout === "notice") layoutNotice(ctx, r);
  else if (r.layout === "checklist") layoutChecklist(ctx, r);
  else if (r.layout === "scene" && r.illustration) layoutPoster(ctx, r);
  else if ((r.layout === "summary" || r.layout === "scene") && ((r.copy.items?.length ?? 0) > 0 || r.copy.points.some(Boolean))) layoutSummary(ctx, r);
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
