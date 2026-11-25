// 픽셀 파티클: 버튼 '뚝딱' 효과와 생성 완료 축하에 쓴다. 브라우저에서만 호출.
const COLORS = ["#ffc23d", "#ffb27a", "#c8500c", "#ffe0a8"];

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** (x, y)에서 네모 도트를 흩뿌린다 */
export function burst(x: number, y: number, { count = 6, spread = 26, size = 4, life = 460, rise = 0 } = {}) {
  if (calm()) return;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const d = spread * (0.6 + Math.random() * 0.6);
    const s = size * (Math.random() < 0.3 ? 1.5 : 1);
    const el = document.createElement("i");
    el.className = "px-dot";
    el.style.cssText = `left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;background:${COLORS[i % COLORS.length]}`;
    document.body.appendChild(el);
    el.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - rise}px) scale(.4)`, opacity: 0 },
      ],
      { duration: life * (0.8 + Math.random() * 0.4), easing: "cubic-bezier(.16,1,.3,1)" },
    ).onfinish = () => el.remove();
  }
}

/** 생성 완료: 화면 위쪽에서 작게 터지는 픽셀 축하 */
export function celebrate() {
  const x = window.innerWidth / 2;
  const y = Math.min(window.innerHeight * 0.28, 220);
  burst(x, y, { count: 18, spread: 120, size: 6, life: 900, rise: 30 });
  setTimeout(() => burst(x - 140, y + 30, { count: 8, spread: 60, size: 5, life: 700 }), 120);
  setTimeout(() => burst(x + 140, y + 30, { count: 8, spread: 60, size: 5, life: 700 }), 200);
}
