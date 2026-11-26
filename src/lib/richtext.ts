// 본문 서식 표시: {종류값|글자}  예) {b|진하게} {c#e53935|빨강} {h#fff59d|형광펜} {f나눔고딕|글꼴} {s24|크기}
// 겹쳐 쓸 수 있다: {c#e53935|{b|빨강 굵게}}. 글은 평문으로 저장하고, 복사용 HTML을 만들 때만 스타일로 바꾼다.

export const FONTS = ["나눔고딕", "나눔명조", "나눔바른고딕", "나눔스퀘어", "마루부리"];
export const SIZES = [13, 15, 16, 19, 24, 28];
export const TEXT_COLORS = ["#e53935", "#fb8c00", "#43a047", "#1e88e5", "#8e24aa", "#212121", "#757575"];
export const BOX_COLORS = ["#fff59d", "#ffcc80", "#a5d6a7", "#90caf9", "#f8bbd0", "#e0e0e0"];

export type FmtKind = "b" | "u" | "f" | "s" | "c" | "h";

const TOKEN = /\{([bufsch])([^|{}]*)\|([^{}]*)\}/g;

/** 서식 표시를 지운 평문 (글자수·검사·텍스트 복사용) */
export function stripFmt(t: string): string {
  let prev: string;
  do {
    prev = t;
    t = t.replace(TOKEN, "$3");
  } while (t !== prev);
  return t;
}

/** 이스케이프된 문자열의 서식 표시를 인라인 스타일로 바꾼다. 값은 화이트리스트만 통과한다. */
export function fmtHtml(escaped: string): string {
  let prev: string;
  do {
    prev = escaped;
    escaped = escaped.replace(TOKEN, (_, k: FmtKind, v: string, inner: string) => {
      if (k === "b") return `<b>${inner}</b>`;
      if (k === "u") return `<u>${inner}</u>`;
      if (k === "c" && /^#[0-9a-f]{6}$/i.test(v)) return `<span style="color:${v};">${inner}</span>`;
      if (k === "h" && /^#[0-9a-f]{6}$/i.test(v)) return `<span style="background-color:${v};">${inner}</span>`;
      if (k === "f" && FONTS.includes(v)) return `<span style="font-family:'${v}';">${inner}</span>`;
      if (k === "s" && SIZES.includes(Number(v))) return `<span style="font-size:${v}px;">${inner}</span>`;
      return inner;
    });
  } while (escaped !== prev);
  return escaped;
}

/** 선택 영역을 서식으로 감싼다. 문단(줄)마다 따로 감싸고, 새로 생긴 범위를 돌려준다. */
export function wrapFmt(text: string, start: number, end: number, kind: FmtKind, val = "") {
  const picked = text.slice(start, end);
  const wrapped = picked
    .split("\n")
    .map((seg) => (seg.trim() ? seg.replace(/^(\s*)(.*?)(\s*)$/, `$1{${kind}${val}|$2}$3`) : seg))
    .join("\n");
  return { text: text.slice(0, start) + wrapped + text.slice(end), end: start + wrapped.length };
}

/** 선택 영역의 서식을 지운다. */
export function clearFmt(text: string, start: number, end: number) {
  const plain = stripFmt(text.slice(start, end));
  return { text: text.slice(0, start) + plain + text.slice(end), end: start + plain.length };
}
