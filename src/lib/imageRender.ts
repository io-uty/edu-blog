// 1:1 블로그 이미지를 Canvas로 그린다. 글자·로고·체크 항목은 모두 코드로 렌더링하고,
// 일러스트(선택)는 이미지로 받아 배치만 한다. 브라우저 전용.
// 카드뉴스 템플릿은 3종: 클립 노트(종이+클립), 파일 폴더(폴더+폴라로이드+정보표), 말풍선(빛 번짐+유리 말풍선).
import type { ImageCopy, ImageKind } from "./imageCopy";
import type { ImageDesign, ImageLayout } from "./settings";

export const SIZE = 1080;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

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
type Row = { label: string; detail: string };

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
  await Promise.all([900, 800, 700, 600, 500].map((w) => document.fonts.load(`${w} 80px "Pretendard Variable"`, text).catch(() => [])));
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

function seeded(seed: number) {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function mix(a: string, b: string, t: number) {
  const pa = a.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  const pb = b.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  return "#" + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0")).join("");
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

/** 글자가 maxW 를 넘으면 …로 줄인다 */
function ellipsize(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** 띄어쓰기 단위로 maxW 안에서 줄을 나눈다(넘치는 마지막 줄은 …) */
function wrap(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(t).width <= maxW) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines) kept[maxLines - 1] = lines.slice(maxLines - 1).join(" ");
  return kept.map((l) => ellipsize(ctx, l, maxW));
}

function drawCover(ctx: Ctx, img: Pic) {
  const sc = Math.max(SIZE / img.width, SIZE / img.height);
  ctx.drawImage(img, (SIZE - img.width * sc) / 2, (SIZE - img.height * sc) / 2, img.width * sc, img.height * sc);
}

/** 사진을 주어진 영역에 cover로 채운다(가운데 기준) */
function drawPhotoIn(ctx: Ctx, img: Pic, x: number, y: number, w: number, h: number) {
  const sc = Math.max(w / img.width, h / img.height);
  const dw = img.width * sc;
  const dh = img.height * sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** 로고를 높이 h로 그린다. align: 기준 x가 왼쪽/가운데/오른쪽 */
function drawLogo(ctx: Ctx, logo: HTMLImageElement, x: number, y: number, h: number, align: "left" | "center" | "right") {
  const w = Math.min(h * 6, (logo.width / logo.height) * h);
  const lx = align === "left" ? x : align === "center" ? x - w / 2 : x - w;
  ctx.drawImage(logo, lx, y, w, h);
}

/** 종이 질감: 아주 고운 점 노이즈 */
function grain(ctx: Ctx, alpha: number, seed: number) {
  const rnd = seeded(seed);
  ctx.save();
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 1.5})`;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 2);
  }
  ctx.restore();
}

/** 종이 클립(선 하나로 세 번 꺾인 철사) */
function paperclip(ctx: Ctx, x: number, y: number, scale: number, deg: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.lineWidth = 6.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.moveTo(10, 100);
  ctx.lineTo(10, 0);
  ctx.arc(21, 0, 11, Math.PI, 0);
  ctx.lineTo(32, 124);
  ctx.arc(16, 124, 16, 0, Math.PI);
  ctx.lineTo(0, -12);
  ctx.arc(21, -12, 21, Math.PI, 0);
  ctx.lineTo(42, 86);
  ctx.stroke();
  ctx.restore();
}

/** 넘김 표시 » */
function chevrons(ctx: Ctx, x: number, y: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const dx of [0, 28]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y - 17);
    ctx.lineTo(x + dx + 17, y);
    ctx.lineTo(x + dx, y + 17);
    ctx.stroke();
  }
  ctx.restore();
}

/** 네 갈래 반짝임 */
function star(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(255,255,255,0.95)";
  ctx.shadowBlur = s * 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.fill();
  // 가늘고 긴 빛줄기
  ctx.globalAlpha = 0.55;
  ctx.fillRect(-s * 2.4, -1, s * 4.8, 2);
  ctx.fillRect(-1, -s * 2, 2, s * 4);
  ctx.restore();
}

const bandColor = (d: ImageDesign) => (luminance(d.primary) < 0.35 ? d.primary : "#141B34");
const hiColor = (d: ImageDesign) => (luminance(d.accent) > 0.45 ? d.accent : "#FFD84D");

/** 항목(라벨+설명)이 있으면 그것을, 없으면 체크 항목을 쓴다. 최대 4개 */
const rowsOf = (c: ImageCopy): Row[] =>
  (c.items?.length ? c.items.filter((i) => i.label) : c.points.filter(Boolean).map((p) => ({ label: p, detail: "" }))).slice(0, 4);

// ---------- 레이아웃 선택 ----------

export type CardTemplate = "clip" | "folder" | "bubble";

/** 예전에 저장된 레이아웃 이름도 가장 가까운 템플릿으로 그린다 */
export function normalizeLayout(l: ImageLayout | undefined): CardTemplate {
  if (l === "clip" || l === "folder" || l === "bubble") return l;
  if (l === "note" || l === "card") return "clip";
  if (l === "poster" || l === "scene" || l === "bold") return "bubble";
  return "folder";
}

/** 레이아웃을 직접 고르지 않았으면 블로그 설정의 기본 템플릿 */
export function autoLayout(kind: ImageKind, sectionIndex: number | null, design: ImageDesign, copy?: ImageCopy): ImageLayout {
  void kind;
  void sectionIndex;
  void copy;
  return normalizeLayout(design.layout);
}

/** 학원 색 안에서 이미지마다 배경 톤을 바꾼다(썸네일은 원래 색) */
export function variantDesign(kind: ImageKind, sectionIndex: number | null, d: ImageDesign): ImageDesign {
  if (kind === "thumbnail") return d;
  const v = (sectionIndex ?? 0) % 3;
  if (v === 0) return { ...d, bg: mix(d.bg, "#ffffff", 0.55) };
  if (v === 1) return { ...d, bg: mix(d.primary, "#ffffff", 0.9) };
  return { ...d, bg: mix(d.accent, "#ffffff", 0.3) };
}

// ---------- 1. 클립 노트: 줄무늬 바탕(또는 사진) 위 겹친 종이 + 클립, 제목은 색 박스 라벨 ----------

const EDGE = 72;

function layoutClip(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const ink = "#2B2B2B";
  if (r.illustration) drawCover(ctx, r.illustration);
  else {
    const base = mix(d.bg, "#ECECEC", 0.6);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = mix(base, "#000000", 0.05);
    for (let x = 6; x < SIZE; x += 16) ctx.fillRect(x, 0, 3, SIZE);
  }

  const X = 92;
  const Y = 96;
  const W = SIZE - X * 2;
  const H = SIZE - Y - 104;
  const sheet = (dx: number, dy: number, deg: number, fill: string) => {
    ctx.save();
    ctx.translate(X + W / 2 + dx, Y + H / 2 + dy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.14)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    rr(ctx, -W / 2, -H / 2, W, H, 10);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.restore();
  };
  sheet(14, 26, 1.3, "#D6D6D6");
  sheet(-6, 12, -0.9, "#EFEFEF");
  sheet(0, 0, 0, "#FFFFFF");

  const cx = SIZE / 2;
  const innerW = W - 150;
  const rows = rowsOf(c);
  const tl = c.title.filter(Boolean).slice(0, 3);
  const kicker = tl.length === 3 ? tl[0] : "";
  const boxed = tl.length === 3 ? tl.slice(1) : tl;

  // 크기 재기
  ctx.letterSpacing = "-3px";
  const boxMax = rows.length ? 96 : boxed.length === 1 ? 168 : 146;
  const bs = Math.min(...boxed.map((l) => fit(ctx, l, 900, innerW - 80, boxMax, 52)));
  ctx.letterSpacing = "-1px";
  const ks = kicker ? fit(ctx, kicker, 800, innerW, rows.length ? 48 : 64, 34) : 0;
  ctx.letterSpacing = "0px";
  const ss = c.sub ? fit(ctx, c.sub, 500, innerW, 38, 26) : 0;
  const boxH = bs * 1.2;
  const rowH = rows.length ? Math.min(74, 300 / rows.length) : 0;
  const total =
    (kicker ? ks * 1.15 + 26 : 0) + boxed.length * boxH - (boxed.length - 1) * 6 + (ss ? 46 + ss : 0) + (rows.length ? 44 + rows.length * rowH : 0);
  let y = Math.max(Y + 150, Y + 40 + (H - total) / 2);

  // 맨 위 작은 표기
  const tag = (c.eyebrow || d.label).trim();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (tag) {
    ctx.font = font(600, 30);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = ink;
    ctx.fillText(ellipsize(ctx, tag, innerW), cx, Y + 96);
    ctx.letterSpacing = "0px";
  }

  if (kicker) {
    ctx.font = font(800, ks);
    ctx.letterSpacing = "-1px";
    ctx.fillStyle = ink;
    ctx.fillText(kicker, cx, y + ks * 0.92);
    ctx.letterSpacing = "0px";
    y += ks * 1.15 + 26;
  }

  // 제목: 한 줄씩 색 박스(살짝 기울여 겹친다)
  const tints = [mix(d.point, "#FFFFFF", 0.84), mix(d.accent, "#FFFFFF", 0.72)];
  boxed.forEach((line, i) => {
    ctx.font = font(900, bs);
    ctx.letterSpacing = "-3px";
    const bw = ctx.measureText(line).width + 84;
    ctx.save();
    ctx.translate(cx, y + boxH / 2);
    ctx.rotate(((i % 2 === 0 ? -1.4 : 0.5) * Math.PI) / 180);
    rr(ctx, -bw / 2, -boxH / 2, bw, boxH, 12);
    ctx.fillStyle = tints[i % 2];
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(line, 0, bs * 0.05);
    ctx.restore();
    ctx.letterSpacing = "0px";
    y += boxH - 6;
  });
  y += 6;

  if (ss) {
    ctx.font = font(500, ss);
    ctx.fillStyle = "#3A3A3A";
    ctx.fillText(c.sub, cx, y + 46 + ss * 0.9);
    y += 46 + ss;
  }

  // 항목: 네모 체크 + 라벨 + 설명(한 줄)
  if (rows.length) {
    y += 44;
    const bx = X + 96;
    const bw = W - 192;
    ctx.textAlign = "left";
    rows.forEach((it, i) => {
      const ry = y + i * rowH;
      const mid = ry + rowH / 2;
      if (i > 0) {
        ctx.fillStyle = "rgba(43,43,43,0.14)";
        ctx.fillRect(bx, ry, bw, 2);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = ink;
      rr(ctx, bx, mid - 14, 28, 28, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 6, mid);
      ctx.lineTo(bx + 12, mid + 7);
      ctx.lineTo(bx + 23, mid - 7);
      ctx.stroke();
      const tx = bx + 52;
      ctx.textBaseline = "middle";
      ctx.font = font(800, 32);
      const label = ellipsize(ctx, it.label, bw - 52);
      ctx.fillStyle = ink;
      ctx.fillText(label, tx, mid + 1);
      if (it.detail) {
        const lw = ctx.measureText(label).width + 18;
        ctx.font = font(500, 27);
        ctx.fillStyle = "#6B6B6B";
        ctx.fillText(ellipsize(ctx, it.detail, bw - 52 - lw), tx + lw, mid + 2);
      }
      ctx.textBaseline = "alphabetic";
    });
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  chevrons(ctx, X + W - 112, Y + H - 72, "#A3A3A3");
  if (d.footer && r.logo) drawLogo(ctx, r.logo, X + 64, Y + H - 92, 40, "left");
  paperclip(ctx, X + 40, Y - 22, 1.15, -26, "#8E8E8E");
}

// ---------- 2. 파일 폴더: 크림 종이 위 학원 색 폴더, 왼쪽 색인 탭, 폴라로이드 사진, 정보 표 ----------

function layoutFolder(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const thumb = r.kind === "thumbnail";
  const ink = "#232323";
  ctx.fillStyle = mix(d.bg, "#FFFFFF", 0.25);
  ctx.fillRect(0, 0, SIZE, SIZE);
  grain(ctx, 0.035, 7);

  const fc = luminance(d.point) < 0.5 ? d.point : bandColor(d);
  const L = 200;
  const T = 156;
  const R = 952;
  const B = 984;
  const rows = rowsOf(c);

  // 뒤판 + 오른쪽 위 탭
  ctx.save();
  ctx.shadowColor = "rgba(50,25,10,0.22)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.moveTo(L + 18, T - 32);
  ctx.lineTo(574, T - 32);
  ctx.lineTo(604, T - 82);
  ctx.lineTo(R - 30, T - 82);
  ctx.lineTo(R - 12, T - 62);
  ctx.lineTo(R - 12, B - 8);
  ctx.lineTo(L + 18, B - 8);
  ctx.closePath();
  ctx.fillStyle = mix(fc, "#000000", 0.16);
  ctx.fill();
  ctx.restore();

  // 탭 위 작은 표기(상담 문구 또는 배지)
  const topLogo = !!(r.logo && d.footer);
  const tabText = (thumb && d.contact?.trim()) || (topLogo ? c.eyebrow : "");
  if (tabText) {
    ctx.font = font(600, 22);
    ctx.letterSpacing = "2px";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(ellipsize(ctx, tabText, R - 640), R - 44, T - 46);
    ctx.textAlign = "left";
    ctx.letterSpacing = "0px";
  }

  // 왼쪽 색인 탭 3개(항목이 있으면 라벨을 세로로)
  for (let i = 0; i < 3; i++) {
    const ty = T + 56 + i * 262;
    const th = 214;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = -3;
    ctx.beginPath();
    ctx.moveTo(L + 12, ty);
    ctx.lineTo(L - 32, ty + 20);
    ctx.lineTo(L - 32, ty + th - 20);
    ctx.lineTo(L + 12, ty + th);
    ctx.closePath();
    ctx.fillStyle = mix(fc, "#000000", 0.07);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(L - 12, ty + 40, 5, 0, Math.PI * 2);
    ctx.fill();
    const label = rows[i]?.label;
    if (label) {
      ctx.save();
      ctx.translate(L - 4, ty + th / 2 + 14);
      ctx.rotate(-Math.PI / 2);
      ctx.font = font(600, 20);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillText(ellipsize(ctx, label, th - 80), 0, 0);
      ctx.restore();
    }
  }

  // 앞판
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = -6;
  ctx.shadowOffsetY = 4;
  rr(ctx, L, T, R - L, B - T, 6);
  ctx.fillStyle = fc;
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, L, T, R - L, B - T, 6);
  ctx.clip();
  grain(ctx, 0.05, 11);
  ctx.restore();

  const fg = "#FFFFFF";
  const muted = "rgba(255,255,255,0.8)";
  const x = L + 64;
  const maxW = R - L - 128;
  let y = T + 84;
  const tag = d.label.trim();
  if (tag) {
    ctx.font = font(600, 24);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = muted;
    ctx.fillText(ellipsize(ctx, tag, maxW), x, y);
    ctx.letterSpacing = "0px";
    y += 52;
  } else y += 20;

  // 제목(왼쪽 정렬, 강조 줄은 강조색)
  const lines = c.title.filter(Boolean).slice(0, 3);
  const base = (thumb ? 124 : 108) * (lines.length >= 3 ? 0.84 : 1);
  ctx.letterSpacing = "-3px";
  lines.forEach((line, i) => {
    const s = fit(ctx, line, 900, maxW, base, 54);
    y += s * 0.96;
    ctx.fillStyle = i === c.highlight ? hiColor(d) : fg;
    ctx.fillText(line, x, y);
    y += s * 0.06;
  });
  ctx.letterSpacing = "0px";
  if (c.sub) {
    ctx.font = font(500, 34);
    const sl = wrap(ctx, c.sub, r.illustration ? maxW - 300 : maxW, 2);
    y += 22;
    sl.forEach((l) => {
      y += 44;
      ctx.fillStyle = muted;
      ctx.fillText(l, x, y);
    });
  }

  // 폴라로이드(사진이 있을 때)
  const pw = 340;
  const ph = 400;
  if (r.illustration) {
    ctx.save();
    ctx.translate(R - 112, B - 252);
    ctx.rotate((4 * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#F7F7F4";
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowColor = "transparent";
    drawPhotoIn(ctx, r.illustration, -pw / 2 + 20, -ph / 2 + 20, pw - 40, pw - 40);
    const capY = -ph / 2 + pw - 20 + 2;
    const capH = ph - (pw - 20) - 2;
    if (r.logo) drawLogo(ctx, r.logo, 0, capY + (capH - 36) / 2, 36, "center");
    else if (tag) {
      ctx.font = font(900, 28);
      ctx.letterSpacing = "-1px";
      ctx.textAlign = "center";
      ctx.fillStyle = fc;
      ctx.fillText(ellipsize(ctx, tag, pw - 60), 0, capY + capH / 2 + 10);
      ctx.letterSpacing = "0px";
      ctx.textAlign = "left";
    }
    ctx.restore();
    paperclip(ctx, R - 72, B - 470, 0.62, 8, "#BDBDBD");
  }

  // 정보 표(바깥 테두리 + 줄 구분)
  if (rows.length) {
    const right = r.illustration ? R - 320 : R - 64;
    const tw = right - x;
    const bottom = B - 64;
    const rh = Math.max(46, Math.min(64, (bottom - (y + 40)) / rows.length));
    const top = bottom - rh * rows.length;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, top, tw, rh * rows.length);
    ctx.textBaseline = "middle";
    rows.forEach((it, i) => {
      const ry = top + i * rh;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(x, ry);
        ctx.lineTo(right, ry);
        ctx.stroke();
      }
      ctx.font = font(700, 25);
      ctx.letterSpacing = "1px";
      const label = ellipsize(ctx, it.detail ? `${it.label}:` : it.label, tw - 44);
      ctx.fillStyle = fg;
      ctx.fillText(label, x + 22, ry + rh / 2 + 1);
      if (it.detail) {
        const lw = ctx.measureText(label).width + 12;
        ctx.font = font(500, 25);
        ctx.fillStyle = muted;
        ctx.fillText(ellipsize(ctx, it.detail, tw - 44 - lw), x + 22 + lw, ry + rh / 2 + 1);
      }
      ctx.letterSpacing = "0px";
    });
    ctx.textBaseline = "alphabetic";
  }

  // 위아래 작은 캡션(크림 바탕)
  ctx.textAlign = "center";
  if (topLogo) drawLogo(ctx, r.logo!, SIZE / 2, 22, 40, "center");
  else if (c.eyebrow) {
    ctx.font = font(700, 22);
    ctx.letterSpacing = "3px";
    ctx.fillStyle = ink;
    ctx.fillText(ellipsize(ctx, c.eyebrow, 420), SIZE / 2, 52);
    ctx.letterSpacing = "0px";
  }
  ctx.textAlign = "left";
}

// ---------- 3. 말풍선: 학원 색 그라데이션 + 빛 번짐 + 점 격자 + 유리 말풍선, 아래 큰 흰 제목 ----------

/** 둥근 말풍선(꼬리는 오른쪽 아래) */
function bubblePath(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const rad = Math.min(46, h / 2);
  const tx = x + w - rad;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.quadraticCurveTo(tx + 6, y + h + 22, tx + 26, y + h + 30);
  ctx.quadraticCurveTo(tx - 22, y + h + 26, tx - 46, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function glassBubble(ctx: Ctx, x: number, y: number, w: number, h: number, base: string) {
  bubblePath(ctx, x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, mix(base, "#FFFFFF", 0.62));
  g.addColorStop(1, mix(base, "#FFFFFF", 0.78));
  ctx.fillStyle = g;
  ctx.fill();
  // 안쪽 가장자리가 밝게 번지는 유리 느낌
  ctx.save();
  ctx.clip();
  ctx.filter = "blur(10px)";
  ctx.lineWidth = 26;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();
  ctx.restore();
  bubblePath(ctx, x, y, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#16171B";
  ctx.stroke();
}

function layoutBubble(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const thumb = r.kind === "thumbnail";
  const base = luminance(d.point) < 0.5 ? d.point : bandColor(d);
  const ink = "#15161A";

  if (r.illustration) {
    drawCover(ctx, r.illustration);
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, `${base}33`);
    g.addColorStop(0.5, `${base}55`);
    g.addColorStop(1, `${base}EE`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, SIZE);
    g.addColorStop(0, mix(base, "#FFFFFF", 0.22));
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // 큰 빛 번짐
    ctx.save();
    ctx.translate(620, 380);
    ctx.scale(1.25, 1);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
    rg.addColorStop(0, "rgba(255,255,255,0.97)");
    rg.addColorStop(0.35, "rgba(255,255,255,0.8)");
    rg.addColorStop(0.7, "rgba(255,255,255,0.22)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 400, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 점 격자
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  for (let gy = 20; gy < SIZE; gy += 28) for (let gx = 20; gx < SIZE; gx += 28) ctx.fillRect(gx, gy, 2.6, 2.6);
  star(ctx, 300, 190, 34);
  star(ctx, 930, 360, 26);
  star(ctx, 130, 560, 46);

  // 아래 제목부터 높이를 잰다
  const rows = rowsOf(c);
  const lines = c.title.filter(Boolean).slice(0, 3);
  const maxW = SIZE - EDGE * 2;
  const tbase = (thumb ? 108 : 94) * (lines.length >= 3 ? 0.86 : 1);
  ctx.letterSpacing = "-2px";
  const sizes = lines.map((l) => fit(ctx, l, 800, maxW, tbase, 52));
  ctx.letterSpacing = "0px";
  const subBelow = rows.length > 0 && !!c.sub;
  const subS = subBelow ? fit(ctx, c.sub, 500, maxW - 120, 38, 26) : 0;
  const bottomPad = 92;
  const titleH = sizes.reduce((a, s) => a + s * 1.12, 0);
  const titleTop = SIZE - bottomPad - (subBelow ? subS + 30 : 0) - titleH;

  // 말풍선 내용
  type B = { w: number; h: number; draw: (x: number, y: number, w: number, h: number) => void };
  const bubbles: B[] = [];
  const bmax = 640;
  if (rows.length) {
    const n = rows.length;
    const bh = n >= 4 ? 84 : 96;
    rows.forEach((it) => {
      ctx.font = font(700, 34);
      const lw = ctx.measureText(it.label).width;
      ctx.font = font(500, 28);
      const dw = it.detail ? ctx.measureText(it.detail).width + 20 : 0;
      const w = Math.min(bmax, lw + dw + 100);
      bubbles.push({
        w,
        h: bh,
        draw: (x, y, w, h) => {
          ctx.textBaseline = "middle";
          ctx.font = font(700, 34);
          const label = ellipsize(ctx, it.label, w - 100);
          ctx.fillStyle = ink;
          ctx.fillText(label, x + 50, y + h / 2 + 1);
          if (it.detail) {
            const lw2 = ctx.measureText(label).width + 20;
            ctx.font = font(500, 28);
            ctx.fillStyle = "#3D3F47";
            ctx.fillText(ellipsize(ctx, it.detail, w - 100 - lw2), x + 50 + lw2, y + h / 2 + 2);
          }
          ctx.textBaseline = "alphabetic";
        },
      });
    });
  } else {
    if (c.sub) {
      ctx.font = font(500, 42);
      const sl = wrap(ctx, c.sub, bmax - 110, 3);
      const w = Math.max(...sl.map((l) => ctx.measureText(l).width)) + 110;
      bubbles.push({
        w,
        h: sl.length * 60 + 64,
        draw: (x, y) => {
          ctx.font = font(500, 42);
          ctx.fillStyle = ink;
          sl.forEach((l, i) => ctx.fillText(l, x + 55, y + 32 + 46 + i * 60));
        },
      });
    }
    // 입력 중… 점 세 개
    bubbles.push({
      w: 190,
      h: 100,
      draw: (x, y, w, h) => {
        ctx.fillStyle = ink;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(x + w / 2 + i * 34, y + h / 2, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }
  const gap = 48;
  const areaTop = 180;
  const areaBot = titleTop - 70;
  const need = bubbles.reduce((a, b) => a + b.h, 0) + gap * (bubbles.length - 1);
  const g2 = need > areaBot - areaTop ? Math.max(30, gap - (need - (areaBot - areaTop)) / Math.max(1, bubbles.length - 1)) : gap;
  const used = bubbles.reduce((a, b) => a + b.h, 0) + g2 * (bubbles.length - 1);
  let by = areaTop + Math.max(0, (areaBot - areaTop - used) / 2);
  bubbles.forEach((b, i) => {
    const right = i % 2 === 0 ? 800 : 860;
    const bx = Math.max(EDGE, right - b.w);
    const bw = right - bx;
    glassBubble(ctx, bx, by, bw, b.h, base);
    b.draw(bx, by, bw, b.h);
    by += b.h + g2;
  });

  // 맨 위 표기
  const tag = (c.eyebrow || d.label).trim();
  ctx.fillStyle = "#FFFFFF";
  if (tag) {
    ctx.font = font(700, 40);
    ctx.letterSpacing = "-1px";
    ctx.fillText(ellipsize(ctx, tag, 560), EDGE, 112);
    ctx.letterSpacing = "0px";
  }
  const contact = (d.contact ?? "").trim();
  if (thumb && contact) {
    ctx.font = font(600, 28);
    ctx.textAlign = "right";
    ctx.fillText(ellipsize(ctx, contact, 360), SIZE - EDGE, 108);
    ctx.textAlign = "left";
  }

  // 제목(흰색, 왼쪽 아래)
  ctx.save();
  ctx.shadowColor = `${mix(base, "#000000", 0.4)}55`;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  let y = titleTop;
  ctx.letterSpacing = "-2px";
  lines.forEach((line, i) => {
    y += sizes[i] * 1.0;
    ctx.font = font(800, sizes[i]);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(line, EDGE, y);
    y += sizes[i] * 0.12;
  });
  ctx.letterSpacing = "0px";
  if (subBelow) {
    ctx.font = font(500, subS);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(c.sub, EDGE, y + 30 + subS * 0.9);
  }
  ctx.restore();
  if (r.logo && (thumb || d.footer)) drawLogo(ctx, r.logo, SIZE - EDGE, SIZE - bottomPad - 44, 44, "right");
}

// ---------- 진입점 ----------

export async function renderImage(r: RenderInput): Promise<HTMLCanvasElement> {
  const itemText = (r.copy.items ?? []).flatMap((i) => [i.label, i.detail]);
  await ensureFonts([r.copy.eyebrow, ...r.copy.title, r.copy.sub, ...r.copy.points, ...itemText, r.design.label, r.design.contact ?? "", "0123456789-:…"].join(""));
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  const t = normalizeLayout(r.layout);
  if (t === "clip") layoutClip(ctx, r);
  else if (t === "folder") layoutFolder(ctx, r);
  else layoutBubble(ctx, r);
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
