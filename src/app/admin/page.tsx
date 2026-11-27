"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, LogOut } from "lucide-react";
import AdminView from "@/components/AdminView";
import Logo from "@/components/Logo";

type State = { s: "loading" } | { s: "login" } | { s: "denied" } | { s: "error" } | { s: "ok"; email: string };

// 운영자 전용 화면(개인용). 본 서비스 화면과 연결되어 있지 않고, 운영자로 등록된 계정만 열린다.
export default function AdminPage() {
  const [st, setSt] = useState<State>({ s: "loading" });
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return setSt({ s: "login" });
        if (r.status === 403) return setSt({ s: "denied" });
        if (!r.ok) return setSt({ s: "error" });
        const j = await r.json();
        setSt({ s: "ok", email: j.email });
      })
      .catch(() => setSt({ s: "error" }));
  }, []);

  if (st.s === "ok")
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-ink px-4 text-white md:px-6">
          <Logo className="text-white [&_svg_rect]:fill-white [&_svg_path]:stroke-ink" />
          <span className="rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold">운영 / 개인용</span>
          <span className="ml-auto hidden truncate text-[13px] text-white/70 sm:block">{st.email}</span>
          <form action="/auth/signout" method="post">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] hover:bg-white/20">
              <LogOut size={14} /> 로그아웃
            </button>
          </form>
        </div>
        <AdminView />
      </div>
    );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[380px] rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        {st.s === "loading" && <p className="mt-6 flex items-center justify-center gap-2 text-sub"><Loader2 size={16} className="animate-spin" /> 확인 중…</p>}
        {st.s === "login" && (
          <>
            <p className="mt-6 text-[15px]">운영자 계정으로 로그인해 주세요.</p>
            <Link className="btn btn-primary mt-4 h-11 w-full" href="/login?next=/admin">로그인</Link>
          </>
        )}
        {st.s === "denied" && (
          <>
            <p className="mt-6 text-[15px]">이 계정은 운영자가 아닙니다.</p>
            <form action="/auth/signout" method="post" className="mt-4">
              <button className="btn h-11 w-full">다른 계정으로 로그인</button>
            </form>
          </>
        )}
        {st.s === "error" && <p className="mt-6 text-[15px] text-err">연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
      </div>
    </div>
  );
}
