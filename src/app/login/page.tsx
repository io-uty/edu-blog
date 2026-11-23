"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { useLock } from "@/lib/useLock";

/** 로그인 뒤 이동할 곳. 같은 사이트 안의 경로(/로 시작, //·\\ 제외)만 허용해 외부 주소로 보내지 않는다. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next") ?? "";
  return /^\/(?![/\\])/.test(n) ? n : "/";
}

export default function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [run, busy] = useLock();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      setError("");
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      }).catch(() => null);
      if (r?.ok) return void (window.location.href = nextPath());
      const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(r ? (j?.error ?? "로그인하지 못했습니다.") : "서버에 연결하지 못했습니다.");
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4 py-8">
      <div className="w-full max-w-[380px] rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <p className="mt-2 text-xs text-sub">학원 블로그 글을 뚝딱 한 번에</p>
        <h1 className="mt-6 text-[20px] font-bold">로그인</h1>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="loginId">아이디</label>
            <input id="loginId" required autoComplete="username" autoCapitalize="none" className="field" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="pw">비밀번호</label>
            <input id="pw" type="password" required autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary h-11 w-full" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />} 로그인
          </button>
        </form>
        {error && <p role="status" className="mt-4 text-[14px] leading-6 text-err">{error}</p>}
        <p className="mt-6 text-center text-[14px] text-sub">
          처음이신가요?{" "}
          <a className="font-semibold text-ink underline underline-offset-2" href="/signup">
            회원가입
          </a>
        </p>
      </div>
    </div>
  );
}
