import { describe, expect, it } from "vitest";
import { deepen } from "../src/lib/imageRender";

const lum = (hex: string) => {
  const [r, g, b] = (hex.slice(1).match(/.{2}/g) ?? []).map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("포인트색 진하게", () => {
  it("어두운 색은 그대로 둔다", () => {
    expect(deepen("#E04A2F")).toBe("#E04A2F");
  });
  it("밝은 파스텔은 같은 계열로 어둡게, 검정이 되지는 않는다", () => {
    const c = deepen("#FFD6E0");
    expect(lum(c)).toBeLessThan(0.42);
    expect(lum(c)).toBeGreaterThan(0.15);
    const [r, , b] = (c.slice(1).match(/.{2}/g) ?? []).map((v) => parseInt(v, 16));
    expect(r).toBeGreaterThan(b); // 분홍 계열 유지
  });
  it("흰색도 회색까지만 내려간다", () => {
    expect(lum(deepen("#FFFFFF"))).toBeGreaterThan(0.1);
  });
});
