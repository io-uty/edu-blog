// 1:1 블로그 이미지를 Canvas로 그린다. 글자·로고·체크 항목은 모두 코드로 렌더링하고,
// 일러스트(선택)는 이미지로 받아 배치만 한다. 브라우저 전용.
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
    [...[900, 800, 700].map((w) => `${w} 80px "Pretendard Variable"`), `700 80px "${HAND}"`, `400 80px "${ROUND}"`].map((f) =>
      document.fonts.load(f, text).catch(() => []),
    ),
  );
}

// 손글씨 제목(메모지형) · 둥근 손글씨 제목(카드형). layout.tsx 에서 Google Fonts 로 불러온다.
const HAND = "Gaegu";
const ROUND = "Jua";
const handFont = (size: number) => `700 ${size}px "${HAND}", ${FONT}`;
const roundFont = (size: number) => `400 ${size}px "${ROUND}", ${FONT}`;

/** 주어진 폰트로 maxW 안에 들어가는 가장 큰 크기 */
function fitWith(ctx: Ctx, make: (s: number) => string, text: string, maxW: number, max: number, min: number) {
  let s = max;
  for (; s > min; s -= 2) {
    ctx.font = make(s);
    if (ctx.measureText(text).width <= maxW) break;
  }
  ctx.font = make(s);
  return s;
}

/** 형광펜으로 그은 듯한 반투명 띠(끝이 살짝 들쭉날쭉) */
function marker(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 4);
  ctx.lineTo(x + w - 2, y);
  ctx.lineTo(x + w + 4, y + h - 3);
  ctx.lineTo(x - 2, y + h + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 강조 낙서: 짧은 선 세 개(반짝임) */
function sparkle(ctx: Ctx, x: number, y: number, color: string, dir: 1 | -1 = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (const [dx, dy, len] of [[0, -1, 30], [0.75, -0.7, 26], [1, 0, 22]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dir * dx * 14, y + dy * 14);
    ctx.lineTo(x + dir * dx * (14 + len), y + dy * (14 + len));
    ctx.stroke();
  }
  ctx.restore();
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








// ---------- 이미지마다 달라지는 요소 ----------


function mix(a: string, b: string, t: number) {
  const pa = a.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  const pb = b.replace("#", "").match(/.{2}/g)?.map((v) => parseInt(v, 16)) ?? [255, 255, 255];
  return "#" + [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, "0")).join("");
}

/** 레이아웃을 직접 고르지 않았으면: 썸네일은 기본 레이아웃, 소주제는 AI가 정한 종류(그림형/내용정리형) */
export function autoLayout(kind: ImageKind, sectionIndex: number | null, design: ImageDesign, copy?: ImageCopy): ImageLayout {
  void sectionIndex;
  if (kind === "thumbnail") return design.layout;
  if (copy?.visual === "card") return "summary";
  return design.layout === "note" || design.layout === "card" ? design.layout : "scene";
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




/** 글자가 maxW 를 넘으면 …로 줄인다 */
function ellipsize(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** 소주제 내용 정리 카드: 제목 + 번호 붙은 핵심 항목과 한 줄 설명. 부드러운 카드 스타일 */
/** 내용 정리 카드: 위는 학원 색 띠 + 제목, 아래는 번호 매긴 항목(장식 없이 선으로만 나눈다) */
function layoutSummary(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const opts = { x: EDGE, top: 76, maxW: SIZE - EDGE * 2, fg: "#FFFFFF", hi: hiColor(d), muted: "rgba(255,255,255,0.72)", base: 84, showName: true };
  const end = headlineStack(ctx, { ...r, copy: { ...c, sub: "" } }, { ...opts, draw: false });
  const bandH = Math.round(end + 60);
  ctx.fillStyle = mix(d.bg, "#ffffff", 0.6);
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = bandColor(d);
  ctx.fillRect(0, 0, SIZE, bandH);
  headlineStack(ctx, { ...r, copy: { ...c, sub: "" } }, { ...opts, draw: true });

  const rows = (c.items && c.items.length ? c.items.filter((i) => i.label) : c.points.filter(Boolean).map((p) => ({ label: p, detail: "" }))).slice(0, 4);
  const top = bandH + 40;
  const bottom = SIZE - 56;
  const rowH = Math.min(170, (bottom - top) / Math.max(1, rows.length));
  const ink = "#16181f";
  const numW = 96;
  rows.forEach((it, i) => {
    const ry = top + i * rowH;
    if (i > 0) {
      ctx.fillStyle = "rgba(20,24,40,0.12)";
      ctx.fillRect(EDGE, ry, SIZE - EDGE * 2, 2);
    }
    ctx.font = font(900, 64);
    ctx.fillStyle = luminance(d.point) < 0.6 ? d.point : bandColor(d);
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1).padStart(2, "0"), EDGE, ry + rowH / 2 + 4);
    const tx = EDGE + numW + 12;
    const tw = SIZE - EDGE - tx;
    if (it.detail) {
      const ls = fit(ctx, it.label, 800, tw, Math.min(46, rowH * 0.3), 28);
      const ds = Math.min(32, Math.max(24, rowH * 0.2));
      const t0 = ry + (rowH - (ls + 12 + ds)) / 2;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = ink;
      ctx.fillText(ellipsize(ctx, it.label, tw), tx, t0 + ls * 0.9);
      ctx.font = font(500, ds);
      ctx.fillStyle = "#555a66";
      ctx.fillText(ellipsize(ctx, it.detail, tw), tx, t0 + ls + 12 + ds * 0.9);
    } else {
      fit(ctx, it.label, 800, tw, Math.min(50, rowH * 0.34), 30);
      ctx.fillStyle = ink;
      ctx.fillText(ellipsize(ctx, it.label, tw), tx, ry + rowH / 2 + 4);
    }
    ctx.textBaseline = "alphabetic";
  });
}

// ---------- 포스터형(썸네일 기본) ----------

function drawCover(ctx: Ctx, img: Pic) {
  const sc = Math.max(SIZE / img.width, SIZE / img.height);
  ctx.drawImage(img, (SIZE - img.width * sc) / 2, (SIZE - img.height * sc) / 2, img.width * sc, img.height * sc);
}


// ---------- 에디토리얼 포스터(기본 썸네일) ----------
// 원칙: 사진은 가리지 않고, 글자는 단색 띠 위에서 크게·왼쪽 정렬로. 장식(화살표·붓 띠·알약 배지)은 쓰지 않는다.

const EDGE = 72; // 포스터 좌우 여백

/** 학원명(작게) → 제목(굵게, 강조 줄은 강조색) → 부제. draw=false면 높이만 잰다. 끝 y를 돌려준다. */
function headlineStack(
  ctx: Ctx,
  r: RenderInput,
  o: { x: number; top: number; maxW: number; fg: string; hi: string; muted: string; base: number; showName: boolean; draw: boolean },
) {
  const { copy: c, design: d } = r;
  let y = o.top;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const name = d.label.trim();
  if (o.showName && name) {
    ctx.font = font(700, 32);
    if (o.draw) {
      ctx.fillStyle = o.muted;
      ctx.fillText(name, o.x, y + 30);
    }
    y += 30 + 40;
  }
  const lines = c.title.filter(Boolean).slice(0, 3);
  const base = lines.length >= 3 ? Math.round(o.base * 0.86) : o.base;
  ctx.letterSpacing = "-2px";
  lines.forEach((line, i) => {
    const s = fit(ctx, line, 900, o.maxW, base, 56);
    y += s * 0.98;
    if (o.draw) {
      ctx.fillStyle = i === c.highlight ? o.hi : o.fg;
      ctx.fillText(line, o.x, y);
    }
    y += s * 0.16;
  });
  ctx.letterSpacing = "0px";
  if (c.sub) {
    const s = fit(ctx, c.sub, 600, o.maxW, 40, 28);
    y += 20 + s;
    if (o.draw) {
      ctx.fillStyle = o.muted;
      ctx.fillText(c.sub, o.x, y);
    }
  }
  return y;
}

/** 사진을 주어진 영역에 cover로 채운다. 아래쪽 기준으로 맞춰 피사체(사진 아래쪽)가 잘리지 않게 한다. */
function drawPhotoIn(ctx: Ctx, img: Pic, x: number, y: number, w: number, h: number) {
  const sc = Math.max(w / img.width, h / img.height);
  const dw = img.width * sc;
  const dh = img.height * sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + h - dh, dw, dh);
  ctx.restore();
}

/** 로고는 사진 위 왼쪽 아래에 작게(흰 바탕 칩) */
function logoChip(ctx: Ctx, logo: HTMLImageElement | null | undefined) {
  if (!logo) return;
  const lh = 40;
  const lw = Math.min(260, (logo.width / logo.height) * lh);
  const pad = 18;
  const w = lw + pad * 2;
  const h = lh + pad * 1.4;
  const x = EDGE - 8;
  const y = SIZE - h - 48;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  rr(ctx, x, y, w, h, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();
  ctx.drawImage(logo, x + pad, y + (h - lh) / 2, lw, lh);
}

const bandColor = (d: ImageDesign) => (luminance(d.primary) < 0.35 ? d.primary : "#141B34");
const hiColor = (d: ImageDesign) => (luminance(d.accent) > 0.45 ? d.accent : "#FFD84D");

/** 사진형: 위는 학원 색 띠 + 큰 제목, 아래는 사진(경계는 깔끔하게 끊는다) */
function layoutPoster(ctx: Ctx, r: RenderInput) {
  const { design: d } = r;
  const thumb = r.kind === "thumbnail";
  const band = bandColor(d);
  const opts = {
    x: EDGE,
    top: 76,
    maxW: SIZE - EDGE * 2,
    fg: "#FFFFFF",
    hi: hiColor(d),
    muted: "rgba(255,255,255,0.72)",
    base: thumb ? 132 : 100,
    showName: true,
  };
  const end = headlineStack(ctx, r, { ...opts, draw: false });
  const bandH = Math.round(Math.min(SIZE * 0.56, Math.max(SIZE * 0.36, end + 64)));
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, SIZE, bandH);
  if (r.illustration) drawPhotoIn(ctx, r.illustration, 0, bandH, SIZE, SIZE - bandH);
  headlineStack(ctx, r, { ...opts, top: 76 + Math.max(0, (bandH - 64 - end) / 2), draw: true });
  const contact = (d.contact ?? "").trim();
  if (thumb && contact) {
    ctx.font = font(700, 30);
    ctx.textAlign = "right";
    ctx.fillStyle = hiColor(d);
    ctx.fillText(contact, SIZE - EDGE, 76 + 30);
    ctx.textAlign = "left";
  }
  if (thumb || d.footer) logoChip(ctx, r.logo);
}

/** 글자형(사진 없음): 학원 색 바탕에 큰 제목. 사진이 있으면 사진 위 아래쪽을 어둡게 깔고 그 위에 제목 */
function layoutBold(ctx: Ctx, r: RenderInput) {
  const { design: d } = r;
  const thumb = r.kind === "thumbnail";
  const opts = {
    x: EDGE,
    top: 0,
    maxW: SIZE - EDGE * 2,
    fg: "#FFFFFF",
    hi: hiColor(d),
    muted: "rgba(255,255,255,0.74)",
    base: thumb ? 150 : 120,
    showName: !r.illustration,
  };
  if (r.illustration) {
    drawCover(ctx, r.illustration);
    const g = ctx.createLinearGradient(0, SIZE * 0.35, 0, SIZE);
    g.addColorStop(0, "rgba(8,10,18,0)");
    g.addColorStop(1, "rgba(8,10,18,0.82)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const h = headlineStack(ctx, r, { ...opts, draw: false });
    headlineStack(ctx, r, { ...opts, top: SIZE - 84 - h, draw: true });
  } else {
    ctx.fillStyle = bandColor(d);
    ctx.fillRect(0, 0, SIZE, SIZE);
    headlineStack(ctx, r, { ...opts, top: 110, draw: true });
    const contact = (d.contact ?? "").trim();
    if (contact) {
      ctx.font = font(700, 34);
      ctx.fillStyle = hiColor(d);
      ctx.fillText(contact, EDGE, SIZE - 84);
    }
  }
  if (r.logo) logoChip(ctx, r.logo);
}

// ---------- 메모지형: 사진 위에 손글씨 메모지 ----------

function layoutNote(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  if (r.illustration) drawCover(ctx, r.illustration);
  else {
    ctx.fillStyle = mix(d.bg, "#ffffff", 0.35);
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  const ink = luminance(d.primary) < 0.35 ? d.primary : "#1F3A2A";
  const lines = c.title.filter(Boolean).slice(0, 3);
  const noteW = 720;
  const maxW = noteW - 110;
  const sizes = lines.map((l) => fitWith(ctx, handFont, l, maxW, lines.length >= 3 ? 118 : 134, 64));
  const subS = c.sub ? fitWith(ctx, handFont, c.sub, maxW - 60, 50, 30) : 0;
  const noteH = Math.min(SIZE - 200, 110 + sizes.reduce((a, s) => a + s * 1.02, 0) + (c.sub ? subS * 1.9 + 30 : 0) + 70);
  const cx = SIZE / 2;
  const cy = SIZE * 0.47;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-2 * Math.PI) / 180);
  // 종이 그림자 + 메모지
  ctx.shadowColor = "rgba(40,30,20,0.28)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = mix(d.accent, "#F4F7D8", 0.72);
  ctx.fillRect(-noteW / 2, -noteH / 2, noteW, noteH);
  ctx.shadowColor = "transparent";
  // 마스킹테이프(체크무늬)
  ctx.save();
  ctx.translate(0, -noteH / 2);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = mix(d.primary, "#ffffff", 0.72);
  ctx.fillRect(-100, -30, 200, 60);
  ctx.strokeStyle = mix(d.primary, "#ffffff", 0.45);
  ctx.lineWidth = 3;
  for (let x = -90; x < 100; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, -30);
    ctx.lineTo(x, 30);
    ctx.stroke();
  }
  for (let y = -20; y < 30; y += 18) {
    ctx.beginPath();
    ctx.moveTo(-100, y);
    ctx.lineTo(100, y);
    ctx.stroke();
  }
  ctx.restore();

  // 손글씨 제목(강조 줄 밑에 형광펜)
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let y = -noteH / 2 + 80;
  lines.forEach((line, i) => {
    const s = sizes[i];
    ctx.font = handFont(s);
    y += s * 0.92;
    const w = ctx.measureText(line).width;
    if (i === c.highlight) marker(ctx, -w / 2 - 10, y - s * 0.32, w + 20, s * 0.34, mix(d.accent, "#9BC53D", 0.55));
    ctx.font = handFont(s);
    ctx.fillStyle = ink;
    // 손글씨를 마커처럼 굵게: 같은 색으로 테두리를 한 번 더 그린다
    ctx.strokeStyle = ink;
    ctx.lineWidth = s * 0.045;
    ctx.lineJoin = "round";
    ctx.strokeText(line, 0, y);
    ctx.fillText(line, 0, y);
    if (i === 0) sparkle(ctx, w / 2 + 24, y - s * 0.55, ink);
    y += s * 0.1;
  });
  // 부제: 분홍 형광펜 띠 위 손글씨
  if (c.sub) {
    y += 30;
    ctx.font = handFont(subS);
    const w = ctx.measureText(c.sub).width;
    marker(ctx, -w / 2 - 24, y, w + 48, subS * 1.25, mix(d.point, "#FFC4D0", 0.6));
    ctx.fillStyle = "#2a2a2a";
    ctx.fillText(c.sub, 0, y + subS * 0.98);
  }
  ctx.restore();
  ctx.textAlign = "left";
  if (d.footer) logoChip(ctx, r.logo);
}

// ---------- 카드형: 위는 흰 카드에 둥근 손글씨 제목, 아래는 그림 ----------

function layoutCard(ctx: Ctx, r: RenderInput) {
  const { copy: c, design: d } = r;
  const P = 40;
  ctx.fillStyle = "#E3E7ED";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const lines = c.title.filter(Boolean).slice(0, 3);
  const maxW = SIZE - P * 2 - 120;
  const sizes = lines.map((l, i) => fitWith(ctx, roundFont, l, maxW, i === 0 ? 128 : 104, 56));
  const cardH = Math.round(Math.min(SIZE * 0.56, 100 + sizes.reduce((a, s) => a + s * 1.08, 0)));
  // 위 카드
  rr(ctx, P, P, SIZE - P * 2, cardH, 44);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  const accent = luminance(d.point) < 0.6 ? d.point : "#1E5BD8";
  ctx.textAlign = "center";
  let y = P + (cardH - sizes.reduce((a, s) => a + s * 1.08, 0)) / 2 + 6;
  lines.forEach((line, i) => {
    const s = sizes[i];
    ctx.font = roundFont(s);
    y += s * 0.95;
    const w = ctx.measureText(line).width;
    if (i === c.highlight) marker(ctx, SIZE / 2 - w / 2 - 14, y - s * 0.3, w + 28, s * 0.32, "#FFE680");
    ctx.font = roundFont(s);
    ctx.fillStyle = i === 0 ? accent : "#151515";
    ctx.fillText(line, SIZE / 2, y);
    if (i === 0) sparkle(ctx, SIZE / 2 + w / 2 + 18, y - s * 0.6, "#F5C518");
    y += s * 0.13;
  });
  ctx.textAlign = "left";
  // 아래 그림 칸
  const top = P + cardH + 18;
  const h = SIZE - P - top;
  ctx.save();
  rr(ctx, P, top, SIZE - P * 2, h, 44);
  ctx.clip();
  ctx.fillStyle = mix(accent, "#ffffff", 0.25);
  ctx.fillRect(P, top, SIZE - P * 2, h);
  if (r.illustration) drawPhotoIn(ctx, r.illustration, P, top, SIZE - P * 2, h);
  else if (c.sub) {
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    const s = fitWith(ctx, roundFont, c.sub, SIZE - P * 2 - 120, 64, 34);
    ctx.font = roundFont(s);
    ctx.fillText(c.sub, SIZE / 2, top + h / 2 + s * 0.35);
    ctx.textAlign = "left";
  }
  ctx.restore();
  if (d.footer) logoChip(ctx, r.logo);
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
  // 디자인은 3종(포스터형·강조 타이포형·내용정리형)으로 통일. 예전에 저장된 레이아웃 이름도 가장 가까운 형으로 그린다.
  const hasRows = (r.copy.items?.length ?? 0) > 0 || r.copy.points.some(Boolean);
  const wantsCard = r.layout === "summary" || r.layout === "headline" || r.layout === "notice" || r.layout === "checklist";
  if (r.layout === "note") layoutNote(ctx, r);
  else if (r.layout === "card") layoutCard(ctx, r);
  else if (wantsCard && hasRows) layoutSummary(ctx, r);
  else if (r.illustration && r.layout !== "bold") layoutPoster(ctx, r);
  else layoutBold(ctx, r);
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
