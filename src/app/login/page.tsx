"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { useLock } from "@/lib/useLock";

/** 로그인 뒤 이동할 곳. 같은 사이트 안의 경로(/로 시작, //·\\ 제외)만 허용해 외부 주소로 보내지 않는다. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next") ?? "";
  return /^\/(?![/\\])/.test(n) ? n : "/";
}

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string; devCode?: string } | undefined;
  return { ok: !!r?.ok, error: r ? (j?.error ?? "요청을 처리하지 못했습니다.") : "서버에 연결하지 못했습니다.", devCode: j?.devCode };
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [f, setF] = useState({ name: "", phone: "", code: "", email: "", loginId: "", password: "" });
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [run, busy] = useLock();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (k === "phone") setSent(false);
  };
  const fail = (text: string) => setMsg({ ok: false, text });

  const sendCode = () =>
    run(async () => {
      setMsg(null);
      const r = await call("/api/auth/phone", "POST", { phone: f.phone });
      if (!r.ok) return fail(r.error);
      setSent(true);
      setMsg({ ok: true, text: r.devCode ? `(개발 모드: 문자 발송 설정 전) 인증번호 ${r.devCode}` : "인증번호를 문자로 보냈습니다. 5분 안에 입력해 주세요." });
    });

  const verify = () =>
    run(async () => {
      setMsg(null);
      const r = await call("/api/auth/phone", "PUT", { phone: f.phone, code: f.code });
      if (!r.ok) return fail(r.error);
      setVerified(true);
      setMsg(null);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !verified) return fail("휴대폰 인증을 먼저 완료해 주세요.");
    return run(async () => {
      setMsg(null);
      const r = mode === "signin" ? await call("/api/auth/login", "POST", f) : await call("/api/auth/signup", "POST", f);
      if (r.ok) window.location.href = nextPath();
      else fail(r.error);
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4 py-8">
      <div className="w-full max-w-[380px] rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <p className="mt-2 text-xs text-sub">학원 블로그 글을 딸깍 한 번에</p>
        <div className="mt-6 flex border-b border-line text-[14px]">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
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
          {mode === "signup" && (
            <>
              <Field label="이름" id="name">
                <input id="name" required maxLength={30} autoComplete="name" className="field" value={f.name} onChange={set("name")} />
              </Field>
              <Field label="전화번호" id="phone">
                <div className="flex gap-2">
                  <input id="phone" type="tel" required inputMode="numeric" autoComplete="tel" placeholder="01012345678" className="field" value={f.phone} readOnly={verified} onChange={set("phone")} />
                  <button type="button" className="btn shrink-0" disabled={busy || verified || !f.phone.trim()} onClick={sendCode}>
                    {sent ? "다시 받기" : "인증번호 받기"}
                  </button>
                </div>
              </Field>
              {sent && !verified && (
                <Field label="인증번호" id="code">
                  <div className="flex gap-2">
                    <input id="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="6자리" className="field" value={f.code} onChange={set("code")} />
                    <button type="button" className="btn shrink-0" disabled={busy || f.code.length !== 6} onClick={verify}>
                      확인
                    </button>
                  </div>
                </Field>
              )}
              {verified && (
                <p className="flex items-center gap-1 text-[14px] text-ok">
                  <Check size={15} /> 휴대폰 인증 완료
                </p>
              )}
              <Field label="이메일" id="email">
                <input id="email" type="email" required autoComplete="email" className="field" value={f.email} onChange={set("email")} />
              </Field>
            </>
          )}
          <Field label="아이디" id="loginId">
            <input
              id="loginId"
              required
              autoComplete="username"
              autoCapitalize="none"
              {...(mode === "signup" ? { pattern: "[A-Za-z0-9_]{4,20}", title: "영문·숫자·_ 4~20자" } : {})}
              className="field"
              value={f.loginId}
              onChange={set("loginId")}
            />
            {mode === "signup" && <p className="mt-1 text-xs text-sub">영문·숫자·_ 4~20자</p>}
          </Field>
          <Field label="비밀번호" id="pw">
            <input id="pw" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signin" ? "current-password" : "new-password"} className="field" value={f.password} onChange={set("password")} />
            {mode === "signup" && <p className="mt-1 text-xs text-sub">8자 이상</p>}
          </Field>
          <button className="btn btn-primary h-10 w-full" disabled={busy || (mode === "signup" && !verified)}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "signin" ? "로그인" : "가입하기"}
          </button>
        </form>
        {msg && <p className={`mt-4 text-[14px] leading-6 ${msg.ok ? "text-ink" : "text-err"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
