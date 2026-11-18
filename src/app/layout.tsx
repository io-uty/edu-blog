import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "에듀윌 편입 강남 AI 블로그 스튜디오",
  description: "네이버 블로그 콘텐츠 제작 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
