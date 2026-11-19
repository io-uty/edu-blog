import type { Metadata } from "next";

// 운영자 전용 화면: 검색 엔진에 노출하지 않는다.
export const metadata: Metadata = {
  title: "bbolog 운영",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
