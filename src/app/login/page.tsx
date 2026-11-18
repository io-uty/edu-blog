"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "confirm"
      ? { ok: false, text: "메일 확인 링크가 만료되었거나 올바르지 않습니다. 다시 로그인하거나 가입해 주세요." }
      : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error)
          return setMsg({
            ok: false,
            text: /confirm/i.test(error.message) ? "메일 확인이 아직 완료되지 않았습니다. 받은편지함의 확인 메일을 눌러 주세요." : "이메일 또는 비밀번호가 올바르지 않습니다.",
          });
        window.location.href = "/";
      } else {
        if (password.length < 8) return setMsg({ ok: false, text: "비밀번호는 8자 이상으로 정해 주세요." });
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) return setMsg({ ok: false, text: /registered|exists/i.test(error.message) ? "이미 가입된 이메일입니다. 로그인해 주세요." : "가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
        if (data.session) window.location.href = "/";
        else setMsg({ ok: true, text: `${email} 로 확인 메일을 보냈습니다. 메일의 링크를 누르면 학원 정보 등록으로 이어집니다.` });
      }
    } catch {
      setMsg({ ok: false, text: "서버에 연결하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4">
      <div className="w-full max-w-[380px] border border-line bg-white p-8">
        <Logo />
        <p className="mt-2 text-xs text-sub">학원 블로그 콘텐츠 제작·관리</p>
        <div className="mt-6 flex border-b border-line text-[14px]">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setMsg(null);
              }}
              className={`h-10 flex-1 border-b-2 ${mode === m ? "border-brand font-semibold" : "border-transparent text-sub"}`}
            >
              {m === "signin" ? "로그인" : "가입하기"}
            </button>
          ))}
        </div>
        <form className="mt-5 space-y-3" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="email">이메일</label>
            <input id="email" type="email" required autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pw">비밀번호</label>
            <input
              id="pw"
              type="password"
              required
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <p className="mt-1 text-xs text-sub">8자 이상</p>}
          </div>
          <button className="btn btn-primary h-10 w-full" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "signin" ? "로그인" : "가입하고 확인 메일 받기"}
          </button>
        </form>
        {msg && <p className={`mt-4 text-[14px] leading-6 ${msg.ok ? "text-ink" : "text-err"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
