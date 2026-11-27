import type { Metadata } from "next";
import "./globals.css";
import BrandIntro, { INTRO_SCRIPT } from "@/components/BrandIntro";
import PixelFx from "@/components/PixelFx";

export const metadata: Metadata = {
  title: "뚝딱",
  description: "블로그 콘텐츠 제작/관리 도구",
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
      </head>
      <body className="antialiased">
        {children}
        <BrandIntro />
        <PixelFx />
      </body>
    </html>
  );
}
