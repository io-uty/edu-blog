import type { Metadata } from "next";
import "./globals.css";
import BrandIntro, { INTRO_SCRIPT } from "@/components/BrandIntro";
import PixelFx from "@/components/PixelFx";

export const metadata: Metadata = {
  title: "뚝딱",
  description: "블로그 콘텐츠 제작·관리 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 인트로 재생 여부를 첫 페인트 전에 정한다(깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 이미지 손글씨 제목용(메모지형: Gaegu, 카드형: Jua) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router 루트 레이아웃이라 모든 페이지에 적용됨 */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gaegu:wght@700&family=Jua&display=swap" />
      </head>
      <body className="antialiased">
        {children}
        <BrandIntro />
        <PixelFx />
      </body>
    </html>
  );
}
