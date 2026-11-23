// 뚝딱 픽셀 커서: 로고·인트로·마우스 커서가 같은 도트 모양을 쓴다.
// X = 테두리, O = 안쪽
const MAP = [
  "X.........",
  "XX........",
  "XOX.......",
  "XOOX......",
  "XOOOX.....",
  "XOOOOX....",
  "XOOOOOX...",
  "XOOOOOOX..",
  "XOOOOOOOX.",
  "XOOOOOXXXX",
  "XOOXOOX...",
  "XOX.XOOX..",
  "XX..XOOX..",
  "X....XOOX.",
  ".....XOOX.",
  "......XX..",
];
export const CURSOR_W = 10;
export const CURSOR_H = MAP.length;

/** 같은 색 가로 줄을 하나의 사각형으로 묶은 목록 */
const runs = (pick: (ch: string) => boolean) =>
  MAP.flatMap((row, y) => {
    const out: { x: number; y: number; w: number }[] = [];
    for (let x = 0; x < row.length; x++) {
      if (!pick(row[x])) continue;
      const s = x;
      while (x + 1 < row.length && pick(row[x + 1])) x++;
      out.push({ x: s, y, w: x - s + 1 });
    }
    return out;
  });
export const SHAPE = runs((c) => c !== ".");
export const EDGE = runs((c) => c === "X");

export const PURPLE = "#2b1a66";
export const PINK = "#ff8fbf";

/** CSS cursor 용 SVG data URL. sparkle: 호버 때 붙는 핑크 반짝이, squash: 누를 때 납작하게 */
export function cursorUrl({ px = 1.5, sparkle = false, squash = false } = {}) {
  const r = (list: typeof SHAPE, fill: string, dx = 0, dy = 0) => list.map((p) => `<rect x="${p.x + dx}" y="${p.y + dy}" width="${p.w}" height="1" fill="${fill}"/>`).join("");
  const vw = CURSOR_W + 5;
  const vh = CURSOR_H + 1;
  const w = Math.round(vw * px);
  const h = Math.round(vh * px * (squash ? 0.82 : 1));
  const star = sparkle ? `<path d="M12.5 1h1v1.5h1.5v1h-1.5V5h-1V3.5H11v-1h1.5z" fill="${PINK}"/>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    r(SHAPE, PINK, 1, 1) + r(SHAPE, "#fff") + r(EDGE, PURPLE) + star + "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0`;
}
