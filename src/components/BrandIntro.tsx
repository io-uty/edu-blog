"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PixelMark } from "./Logo";

// 브랜드 인트로. 재생 여부는 <head> 의 INTRO_SCRIPT 가 첫 페인트 전에 html[data-intro] 로 정한다.
//   full   : 처음 방문(localStorage 기록 없음) 또는 주소에 ?intro — 약 4.6초
//   splash : 재방문 후 새 탭·새 창의 첫 화면 — 약 1초 로고
// 애니메이션은 CSS(globals.css 의 .intro*)로 돌아가서 JS 가 늦게 붙어도 바로 재생되고, 끝나면 스스로 사라진다.
export const INTRO_SCRIPT = `(function(){try{var d=document.documentElement,p=location.pathname;if(/^\\/(admin|auth|checkout)/.test(p))return;
if(/[?&]intro\\b/.test(location.search)||!localStorage.getItem('ddk:intro'))d.dataset.intro='full';
else if(!sessionStorage.getItem('ddk:splash'))d.dataset.intro='splash';
if(d.dataset.intro)sessionStorage.setItem('ddk:splash','1')}catch(e){}})()`;

const LEN = { full: 4700, splash: 1150 } as const;
const POP = [
  [-34, -26], [0, -40], [34, -26], [44, 4], [30, 30], [-2, 40], [-32, 28], [-44, 2],
] as const;

export default function BrandIntro() {
  const [gone, setGone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    try {
      localStorage.setItem("ddk:intro", "1");
    } catch {}
    delete document.documentElement.dataset.intro;
    setGone(true);
  }, []);
  // 시작하기·건너뛰기·Esc: 짧게 사라지며 바로 서비스로
  const leave = useCallback(() => {
    ref.current?.classList.add("intro-leave");
    setTimeout(finish, 260);
  }, [finish]);

  useEffect(() => {
    const mode = document.documentElement.dataset.intro as keyof typeof LEN | undefined;
    if (!mode) return setGone(true);
    const t = setTimeout(finish, LEN[mode] ?? 0);
    const key = (e: KeyboardEvent) => e.key === "Escape" && leave();
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, [finish, leave]);

  if (gone) return null;
  const pop = POP.map(([dx, dy], i) => <i key={i} style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} />);

  return (
    <div ref={ref} className="intro" role="dialog" aria-modal="true" aria-label="뚝딱 소개" data-no-fx>
      <button type="button" className="intro-skip" onClick={leave}>
        건너뛰기
      </button>

      <div className="intro-full">
        <PixelMark size={56} className="intro-logo" />
        <h1 className="intro-h">
          <span className="intro-line">
            {["복잡한", "블로그", "업무는", "그만."].map((w, i) => (
              <span key={w} className="intro-word" style={{ "--i": i } as React.CSSProperties}>
                {w}
              </span>
            ))}
          </span>
          <span className="intro-line intro-line2">
            <span className="intro-word" style={{ "--i": 0 } as React.CSSProperties}>이제,</span>
            <span className="intro-word intro-click" style={{ "--i": 1 } as React.CSSProperties}>뚝딱.</span>
          </span>
        </h1>
        <p className="intro-sub">
          AI가 학원에 꼭 맞는 콘텐츠를 만들고,
          <br />
          당신은 더 중요한 일에 집중하세요.
        </p>
        <div className="intro-cta-wrap">
          <button type="button" className="intro-cta" onClick={leave}>
            시작하기
          </button>
          <span className="intro-tap" aria-hidden />
          <span className="intro-pop" aria-hidden>{pop}</span>
          <span className="intro-cursor" aria-hidden>
            <PixelMark size={30} />
            <svg className="intro-spark" width="12" height="12" viewBox="0 0 4 4" shapeRendering="crispEdges">
              <path d="M1.5 0h1v1.5H4v1H2.5V4h-1V2.5H0v-1h1.5z" fill="#ff8fbf" />
            </svg>
          </span>
        </div>
      </div>

      <div className="intro-splash" aria-hidden>
        <span className="intro-splash-mark">
          <PixelMark size={64} />
          <span className="intro-pop">{pop}</span>
        </span>
        <span className="intro-splash-word">뚝딱</span>
      </div>
    </div>
  );
}
