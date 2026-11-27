// gifenc 는 타입을 내장하지 않아 쓰는 부분만 선언한다.
declare module "gifenc" {
  type Palette = number[][];
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, w: number, h: number, opts?: { palette?: Palette; delay?: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
  export function quantize(rgba: Uint8ClampedArray, maxColors: number): Palette;
  export function applyPalette(rgba: Uint8ClampedArray, palette: Palette): Uint8Array;
}
