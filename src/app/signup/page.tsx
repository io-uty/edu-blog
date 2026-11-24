"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { formatPhone, toPhone } from "@/lib/phone";
import { useLock } from "@/lib/useLock";

// 회원가입 2단계: 1) 이름·전화번호·이메일 → 2) 아이디·비밀번호
async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string; devCode?: string; required?: boolean } | undefined;
  return { ok: !!r?.ok, error: r ? (j?.error ?? "요청을 처리하지 못했습니다.") : "서버에 연결하지 못했습니다.", j };
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-sub">{hint}</p>}
    </div>
  );
}

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ name: "", phone: "", email: "", code: "", loginId: "", password: "", password2: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 휴대폰 인증(서버에서 PHONE_VERIFY=on 일 때만)
  const [needVerify, setNeedVerify] = useState(false);
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [run, busy] = useLock();

  useEffect(() => {
    call("/api/auth/phone", "GET").then((r) => setNeedVerify(!!r.j?.required));
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: k === "phone" ? formatPhone(e.target.value) : e.target.value });
    if (k === "phone") {
      setSent(false);
      setVerified(false);
    }
  };
  const fail = (text: string) => setMsg({ ok: false, text });

  const sendCode = () =>
    run(async () => {
      setMsg(null);
      const r = await call("/api/auth/phone", "POST", { phone: f.phone });
      if (!r.ok) return fail(r.error);
      setSent(true);
      setMsg({ ok: true, text: r.j?.devCode ? `(개발 모드) 인증번호 ${r.j.devCode}` : "인증번호를 문자로 보냈습니다. 5분 안에 입력해 주세요." });
    });
  const verify = () =>
    run(async () => {
      const r = await call("/api/auth/phone", "PUT", { phone: f.phone, code: f.code });
      if (!r.ok) return fail(r.error);
      setVerified(true);
      setMsg(null);
    });

  // 1단계 → 2단계: 전화번호 형식과 중복을 미리 확인
  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toPhone(f.phone)) return fail("휴대폰 번호를 확인해 주세요. 예) 010-1234-5678");
    if (needVerify && !verified) return fail("휴대폰 인증을 먼저 완료해 주세요.");
    return run(async () => {
      setMsg(null);
      const r = await call("/api/auth/check", "POST", { phone: f.phone });
      if (!r.ok) return fail(r.error);
      setStep(2);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.password2) return fail("비밀번호가 서로 다릅니다.");
    return run(async () => {
      setMsg(null);
      const r = await call("/api/auth/signup", "POST", f);
      if (r.ok) return void (window.location.href = "/");
      // 1단계 정보 문제면 1단계로 돌려보낸다
      if (/전화번호|이메일|인증/.test(r.error)) setStep(1);
      fail(r.error);
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg2 px-4 py-8">
      <div className="w-full max-w-[400px] rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <Logo />
        <div className="mt-5 flex items-center justify-between">
          <h1 className="text-[20px] font-bold">회원가입</h1>
          <span className="text-xs tabular-nums text-sub">{step} / 2</span>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-1.5" aria-label="가입 단계">
          {["기본 정보", "아이디·비밀번호"].map((s, i) => (
            <li key={s} className="text-xs">
              <span className={`mb-1.5 block h-1 rounded-full transition-colors duration-300 ${i < step ? "bg-brand" : "bg-line"}`} />
              <span className={i + 1 === step ? "font-semibold text-ink" : "text-sub"}>{s}</span>
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <form className="mt-6 space-y-3" onSubmit={next}>
            <Field label="이름" id="name">
              <input id="name" required maxLength={30} autoComplete="name" className="field" value={f.name} onChange={set("name")} autoFocus />
            </Field>
            <Field label="전화번호" id="phone">
              <div className="flex gap-2">
                <input id="phone" type="tel" required inputMode="numeric" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} className="field" value={f.phone} readOnly={verified} onChange={set("phone")} />
                {needVerify && (
                  <button type="button" className="btn shrink-0" disabled={busy || verified || !f.phone.trim()} onClick={sendCode}>
                    {sent ? "다시 받기" : "인증번호 받기"}
                  </button>
                )}
              </div>
            </Field>
            {needVerify && sent && !verified && (
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
            <button className="btn btn-primary h-11 w-full" disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" />} 다음
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            <Field label="아이디" id="loginId" hint="영문·숫자·_ 4~20자">
              <input
                id="loginId"
                required
                autoComplete="username"
                autoCapitalize="none"
                pattern="[A-Za-z0-9_]{4,20}"
                title="영문·숫자·_ 4~20자"
                className="field"
                value={f.loginId}
                onChange={set("loginId")}
                autoFocus
              />
            </Field>
            <Field label="비밀번호" id="pw" hint="8자 이상">
              <input id="pw" type="password" required minLength={8} autoComplete="new-password" className="field" value={f.password} onChange={set("password")} />
            </Field>
            <Field label="비밀번호 확인" id="pw2">
              <input id="pw2" type="password" required minLength={8} autoComplete="new-password" className="field" value={f.password2} onChange={set("password2")} />
            </Field>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="btn h-11"
                onClick={() => {
                  setStep(1);
                  setMsg(null);
                }}
              >
                <ArrowLeft size={15} /> 이전
              </button>
              <button className="btn btn-primary h-11 flex-1" disabled={busy}>
                {busy && <Loader2 size={15} className="animate-spin" />} 가입하기
              </button>
            </div>
          </form>
        )}

        {msg && <p role="status" className={`mt-4 text-[14px] leading-6 ${msg.ok ? "text-ink" : "text-err"}`}>{msg.text}</p>}
        <p className="mt-6 text-center text-[14px] text-sub">
          이미 계정이 있나요?{" "}
          <a className="font-semibold text-ink underline underline-offset-2" href="/login">
            로그인
          </a>
        </p>
      </div>
    </div>
  );
}
