import { CURSOR_H, CURSOR_W, EDGE, OUTLINE, SHADOW, SHAPE } from "@/lib/pixelCursor";

/** 뚝딱 픽셀 커서 마크(핑크 그림자) */
export function PixelMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  const vw = CURSOR_W + 1;
  const vh = CURSOR_H + 1;
  return (
    <svg width={(size * vw) / vh} height={size} viewBox={`0 0 ${vw} ${vh}`} shapeRendering="crispEdges" aria-hidden className={className}>
      {SHAPE.map((p) => <rect key={`s${p.x}-${p.y}`} x={p.x + 1} y={p.y + 1} width={p.w} height={1} fill={SHADOW} />)}
      {SHAPE.map((p) => <rect key={`f${p.x}-${p.y}`} x={p.x} y={p.y} width={p.w} height={1} fill="#fff" />)}
      {EDGE.map((p) => <rect key={`e${p.x}-${p.y}`} x={p.x} y={p.y} width={p.w} height={1} fill={OUTLINE} />)}
    </svg>
  );
}

/** 뚝딱 워드마크. 누르면 홈(새 콘텐츠 작성)으로 간다. 앱 안에서는 주소의 # 만 바뀌어 새로고침 없이 이동한다. */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // 앱 화면은 주소의 # 로 바뀐다. next/link 는 # 만 바뀔 때 hashchange 를 내지 않아 화면이 그대로라 일반 링크를 쓴다.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/#/compose" className={`inline-flex items-center gap-2 ${className}`} aria-label="뚝딱 홈으로">
      <PixelMark size={22} />
      <span className="text-[20px] font-extrabold leading-none tracking-[-0.03em]">뚝딱</span>
    </a>
  );
}
