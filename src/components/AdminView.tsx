"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Search, X } from "lucide-react";
import { PageHeader } from "./ui";

// 운영자 대시보드. 숫자는 모두 /api/admin/stats 가 DB 실데이터로 계산한 값이다.

/* ---------- 타입 ---------- */
interface Kpis {
  users: number; usersNew: number; usersConfirmed: number;
  tenants: number; tenantsNew: number; activeTenants: number;
  generations: number; projectsCreated: number; imageCards: number; aiImages: number;
  naverOpened: number; publishConfirmed: number; copied: number;
  trialing: number; trialUsedUp: number; paying: number; paidConversion: number;
  checkoutStarted: number; paymentsCompleted: number; checkoutConversion: number;
  revenueTest: number; revenueLive: number;
}
interface TenantRow {
  id: string; name: string; type: string; createdAt: string; ownerEmail: string | null;
  plan: string; state: "trial" | "trial_used_up" | "paid" | "expired" | "none";
  used: number; limit: number | null; projects: number; projectsInRange: number; published: number;
  naverOpened: number; copied: number; lastActivity: string; paidAmount: number; paidMode: "test" | "live" | null;
}
interface Stats {
  generatedAt: string; days: number | null; kpis: Kpis;
  trend: { date: string; signups: number; generations: number; tenants: number }[];
  funnel: { label: string; count: number; ofTop: number; fromPrev: number }[];
  byType: { type: string; tenants: number; generations: number; projects: number; paying: number }[];
  tenants: TenantRow[];
  recent: { at: string; type: string; tenant: string; meta: Record<string, unknown> }[];
  totals: { accounts: number; customers: number; admins: number; tenants: number; projects: number; events: number; payments: number; usage: number };
  audit: { created_at: string; admin_email: string | null; action: string; target: string | null; detail: Record<string, unknown> }[];
}

/* ---------- 표시용 ---------- */
const SERIES = { signups: "#2a78d6", generations: "#eb6834" }; // 검증된 기본 팔레트 1·2번
const EVENT_LABEL: Record<string, string> = {
  signup_completed: "가입 완료", onboarding_started: "학원 등록 시작", onboarding_completed: "학원 등록 완료",
  content_generation_started: "글 생성 시작", content_generation_completed: "글 생성 완료", image_generation_completed: "이미지 구성 완료",
  content_edited: "글 편집", content_copied: "내용 복사", image_downloaded: "이미지 다운로드", package_downloaded: "패키지 다운로드",
  naver_write_opened: "네이버 글쓰기 이동", publish_confirmed: "발행 완료 표시(사용자 확인)", pricing_viewed: "요금 안내 확인",
  purchase_clicked: "구매 클릭", checkout_started: "결제 시작", payment_completed: "결제 완료",
};
const STATE_LABEL: Record<TenantRow["state"], string> = {
  trial: "무료 체험 중", trial_used_up: "체험 소진", paid: "유료", expired: "만료", none: "이용권 없음",
};
const STATE_STYLE: Record<TenantRow["state"], string> = {
  trial: "bg-[#eaf2fc] text-[#1d5fae]",
  trial_used_up: "bg-[#fff1e0] text-warn",
  paid: "bg-[#e6f4ea] text-ok",
  expired: "bg-bg2 text-sub",
  none: "bg-bg2 text-sub",
};
const n = (v: number) => v.toLocaleString("ko-KR");
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;
const won = (v: number) => `${n(v)}원`;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
};
const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

/* ---------- 작은 부품 ---------- */
function Card({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold">{title}</h2>
          {desc && <p className="mt-0.5 text-[13px] text-sub">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-bg2 px-4 py-3.5" title={hint}>
      <p className="text-[13px] text-sub">{label}</p>
      <p className="mt-1 text-[26px] font-extrabold leading-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-sub">{sub}</p>}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------- 일별 추이(선 그래프 2개 계열, 같은 단위: 건수) ---------- */
function TrendChart({ data }: { data: Stats["trend"] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, L = 34, R = 12, T = 12, B = 26;
  const iw = Math.max(10, w - L - R), ih = H - T - B;
  const max = Math.max(4, ...data.map((d) => Math.max(d.signups, d.generations)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => L + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => T + ih - (v / top) * ih;
  const path = (k: "signups" | "generations") => data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[k])}`).join("");
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const hd = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex gap-4 text-[13px]">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.signups }} /> 가입</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.generations }} /> 글 생성</span>
      </div>
      <svg width={w} height={H} role="img" aria-label="일별 가입과 글 생성 추이"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - L) / iw) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={L} x2={L + iw} y1={y(step * k)} y2={y(step * k)} stroke="#ece8e4" strokeWidth={1} />
            <text x={L - 8} y={y(step * k) + 4} textAnchor="end" fontSize={11} fill="#7a756f">{step * k}</text>
          </g>
        ))}
        {data.map((d, i) => i % labelEvery === 0 && (
          <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#7a756f">{d.date.slice(5).replace("-", ".")}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} stroke="#c9c3bc" strokeWidth={1} />}
        <path d={path("signups")} fill="none" stroke={SERIES.signups} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path("generations")} fill="none" stroke={SERIES.generations} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hd && hover !== null && (["signups", "generations"] as const).map((k) => (
          <circle key={k} cx={x(hover)} cy={y(hd[k])} r={4.5} fill={SERIES[k]} stroke="#fff" strokeWidth={2} />
        ))}
      </svg>
      {hd && hover !== null && (
        <div className="pointer-events-none absolute top-8 rounded-xl border border-line bg-white px-3 py-2 text-[13px] shadow-md"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), w - 150) }}>
          <p className="font-semibold">{hd.date.replace(/-/g, ".")}</p>
          <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.signups }} /> 가입 {hd.signups}명</p>
          <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES.generations }} /> 글 생성 {hd.generations}건</p>
          {hd.tenants > 0 && <p className="text-sub">학원 등록 {hd.tenants}곳</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- 퍼널(가로 막대, 단일 색 + 이탈률 표시) ---------- */
function Funnel({ steps }: { steps: Stats["funnel"] }) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  // 가장 많이 빠지는 단계(이전 단계에 사람이 있을 때만)
  let worst = -1, worstDrop = 0;
  steps.forEach((s, i) => {
    if (i === 0 || steps[i - 1].count === 0) return;
    const drop = 1 - s.fromPrev;
    if (drop > worstDrop) { worstDrop = drop; worst = i; }
  });
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[14px]" title={`${s.label}: ${s.count}명`}>
          <span className="truncate">{s.label}</span>
          <div className="relative h-7 rounded-full bg-bg2">
            <div className="h-7 rounded-full" style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / top) * 100)}%`, background: SERIES.signups, opacity: 0.25 + 0.75 * (s.count / top) }} />
            <span className="absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold">{n(s.count)}명</span>
          </div>
          <span className="w-[120px] text-right text-[13px] tabular-nums">
            {i === 0 ? <span className="text-sub">기준</span> : (
              <>
                <span className="text-sub">{pct(s.ofTop)}</span>
                {steps[i - 1].count > 0 && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${i === worst ? "bg-[#fff1e0] font-semibold text-warn" : "text-sub"}`}>
                    이탈 {pct(1 - s.fromPrev)}
                  </span>
                )}
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 학원 유형별(가로 막대) ---------- */
function TypeBars({ rows }: { rows: Stats["byType"] }) {
  const max = Math.max(1, ...rows.map((r) => r.generations));
  if (!rows.length) return <p className="text-[14px] text-sub">등록된 학원이 없습니다.</p>;
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.type} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[14px]" title={`${r.type}: 글 생성 ${r.generations}건`}>
            <span className="truncate">{r.type}</span>
            <div className="h-5 rounded-full bg-bg2">
              <div className="h-5 rounded-full" style={{ width: `${r.generations ? Math.max(3, (r.generations / max) * 100) : 0}%`, background: SERIES.generations }} />
            </div>
            <span className="w-[56px] text-right tabular-nums">{n(r.generations)}건</span>
          </li>
        ))}
      </ul>
      <table className="mt-4 w-full text-[13px]">
        <thead className="text-sub">
          <tr className="border-b border-line">
            <th className="py-1.5 text-left font-medium">유형</th>
            <th className="py-1.5 text-right font-medium">학원</th>
            <th className="py-1.5 text-right font-medium">글 생성</th>
            <th className="py-1.5 text-right font-medium">만든 글</th>
            <th className="py-1.5 text-right font-medium">유료</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} className="border-b border-bg2">
              <td className="py-1.5">{r.type}</td>
              <td className="py-1.5 text-right tabular-nums">{n(r.tenants)}</td>
              <td className="py-1.5 text-right tabular-nums">{n(r.generations)}</td>
              <td className="py-1.5 text-right tabular-nums">{n(r.projects)}</td>
              <td className="py-1.5 text-right tabular-nums">{n(r.paying)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 학원 상세(오른쪽 서랍) ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
function TenantDrawer({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: (msg: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch((e) => setErr(e.message || "불러오지 못했습니다."));
  }, [id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const [delName, setDelName] = useState("");
  const [alsoAccount, setAlsoAccount] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState("");
  async function remove() {
    setDeleting(true);
    setDelErr("");
    const r = await fetch(`/api/admin/tenants/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: delName, alsoAccount }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setDeleting(false);
    if (!r?.ok) return setDelErr(j?.error || "삭제하지 못했습니다.");
    onDeleted(`학원을 삭제했습니다(글 ${j.projects}편${j.accountsDeleted ? `, 계정 ${j.accountsDeleted}개` : ""}).`);
  }
  const t = d?.tenant;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1 text-[13px]"><span className="text-sub">{k}</span><span className="text-right">{v || "-"}</span></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-[560px] flex-col overflow-hidden rounded-l-3xl bg-white shadow-xl" role="dialog" aria-label="학원 상세">
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-[18px] font-bold">{t ? [t.name, t.branch_name].filter(Boolean).join(" ") : "불러오는 중…"}</p>
            {t && <p className="text-[13px] text-sub">{t.academy_type_custom || t.academy_type} · 가입 {dt(t.created_at)}</p>}
          </div>
          <button className="btn btn-sm px-2" onClick={onClose} aria-label="닫기"><X size={15} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {err && <p className="text-err">{err}</p>}
          {!d && !err && <p className="flex items-center gap-2 text-sub"><Loader2 size={16} className="animate-spin" /> 불러오는 중…</p>}
          {d && (
            <>
              <section>
                <p className="label">계정·이용권</p>
                {d.members.map((m: any, i: number) => <Row key={i} k={m.role === "owner" ? "소유자" : m.role} v={`${m.email ?? "-"} · 최근 로그인 ${dt(m.lastSignIn)}`} />)}
                <Row k="현재 상태" v={t.subscription_status} />
                {d.subscriptions.map((s: any, i: number) => <Row key={i} k={`이용권 ${i + 1}`} v={`${s.plan_id} · ${s.status} · ${dt(s.started_at)} ~ ${s.expires_at ? dt(s.expires_at) : "기한 없음"}`} />)}
              </section>
              <section>
                <p className="label">학원 설정</p>
                <Row k="위치" v={d.brand?.location} />
                <Row k="홈페이지" v={d.brand?.official_website} />
                <Row k="블로그" v={d.brand?.blog_url} />
                <Row k="대표 과목" v={(d.brand?.main_subjects ?? []).join(", ")} />
                <Row k="문체" v={d.content?.writing_tone} />
                <Row k="주요 독자" v={d.content?.target_audience} />
                <Row k="SEO 키워드" v={(d.content?.seo_keywords ?? []).join(", ")} />
                <Row k="기존 글 문체 분석" v={d.content?.hasStyleProfile ? "완료" : "안 함"} />
              </section>
              <section>
                <p className="label">만든 글 ({d.projects.length})</p>
                <ul className="divide-y divide-bg2 rounded-2xl border border-line">
                  {d.projects.length === 0 && <li className="px-3 py-2 text-[13px] text-sub">아직 없음</li>}
                  {d.projects.map((p: any) => (
                    <li key={p.id} className="px-3 py-2 text-[13px]">
                      <p className="truncate font-medium" title={p.title}>{p.title || "(제목 없음)"}</p>
                      <p className="text-xs text-sub">{p.content_type} · {dt(p.created_at)} · {p.status === "published_confirmed" ? "발행 완료 표시" : "작성 중"}</p>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <p className="label">결제</p>
                {d.payments.length === 0 ? <p className="text-[13px] text-sub">결제 기록 없음</p> : d.payments.map((p: any) => (
                  <Row key={p.order_id} k={dt(p.created_at)} v={`${p.plan_id} · ${won(p.amount)} · ${p.status}${p.mode === "test" ? " (테스트)" : ""}`} />
                ))}
              </section>
              <section>
                <p className="label">사용 기록 (최근 {d.usage.length})</p>
                {d.usage.slice(0, 20).map((u: any, i: number) => (
                  <Row key={i} k={dt(u.created_at)} v={`${u.usage_type === "content" ? "글" : "이미지"} ${u.quantity > 0 ? `+${u.quantity} 사용` : `${u.quantity} 실패 환불`}`} />
                ))}
                {d.usage.length === 0 && <p className="text-[13px] text-sub">사용 기록 없음</p>}
              </section>
              <section>
                <p className="label">행동 기록 (최근 {d.events.length})</p>
                <ul className="space-y-1">
                  {d.events.map((e: any, i: number) => (
                    <li key={i} className="flex justify-between gap-3 text-[13px]">
                      <span>{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                      <span className="text-sub">{dt(e.occurred_at)}</span>
                    </li>
                  ))}
                  {d.events.length === 0 && <li className="text-[13px] text-sub">기록 없음</li>}
                </ul>
              </section>
              <section className="rounded-2xl border border-[#f2c9c0] bg-[#fff6f3] p-4">
                <p className="text-[14px] font-bold text-err">이 학원 삭제</p>
                <p className="mt-1 text-[13px] leading-5 text-sub">학원 설정, 만든 글, 사용·결제·행동 기록이 모두 삭제되고 되돌릴 수 없습니다. 확인을 위해 학원명 <b className="text-ink">{t.name}</b> 을(를) 그대로 입력해 주세요.</p>
                <input className="field mt-2" placeholder="학원명 입력" value={delName} onChange={(e) => setDelName(e.target.value)} />
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={alsoAccount} onChange={(e) => setAlsoAccount(e.target.checked)} /> 소유 계정(로그인 정보)도 함께 삭제
                </label>
                {delErr && <p className="mt-2 text-[13px] text-err">{delErr}</p>}
                <button className="btn mt-3 w-full border-err text-err" disabled={deleting || delName.trim() !== t.name} onClick={remove}>
                  {deleting && <Loader2 size={14} className="animate-spin" />} 영구 삭제
                </button>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------- 데이터 관리(초기화) ---------- */
function ResetCard({ totals, onDone }: { totals: Stats["totals"]; onDone: (msg: string) => void }) {
  const [scope, setScope] = useState<"data" | "all" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const PHRASE = { data: "데이터 초기화", all: "전체 삭제" } as const;
  async function run() {
    if (!scope) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, confirm: text }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(j?.error || "초기화하지 못했습니다.");
    setScope(null);
    setText("");
    onDone(`초기화했습니다 · 학원 ${j.before.tenants}곳, 글 ${j.before.projects}편, 결제 ${j.before.payments}건, 이벤트 ${j.before.events}건 삭제${j.accountsDeleted ? `, 계정 ${j.accountsDeleted}개 삭제` : ""}`);
  }
  const Opt = ({ k, title, body }: { k: "data" | "all"; title: string; body: string }) => (
    <button
      className={`rounded-2xl border p-4 text-left ${scope === k ? "border-err bg-[#fff6f3]" : "border-line hover:bg-bg2"}`}
      onClick={() => { setScope(k); setText(""); setErr(""); }}
    >
      <p className="text-[15px] font-bold">{title}</p>
      <p className="mt-1 text-[13px] leading-5 text-sub">{body}</p>
    </button>
  );
  return (
    <Card title="데이터 관리" desc="되돌릴 수 없는 작업입니다. 요금제 설정·운영자 등록·삭제 기록은 어떤 경우에도 지우지 않습니다.">
      <p className="mb-3 text-[13px] text-sub">
        지금 저장된 데이터: 학원 {n(totals.tenants)}곳 · 글 {n(totals.projects)}편 · 결제 {n(totals.payments)}건 · 사용 기록 {n(totals.usage)}건 · 이벤트 {n(totals.events)}건 · 고객 계정 {n(totals.customers)}개
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Opt k="data" title="데이터 초기화" body="학원·글·사용·결제·이벤트를 모두 지웁니다. 가입 계정은 남아서, 다시 로그인하면 학원 등록부터 시작합니다." />
        <Opt k="all" title="전체 삭제" body="위 데이터에 더해 고객 계정(로그인 정보)도 모두 지웁니다. 운영자 계정은 남습니다." />
      </div>
      {scope && (
        <div className="mt-4 rounded-2xl border border-[#f2c9c0] bg-[#fff6f3] p-4">
          <p className="text-[14px]">실행하려면 <b className="text-err">{PHRASE[scope]}</b> 를 그대로 입력하세요.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="field max-w-[260px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={PHRASE[scope]} />
            <button className="btn border-err text-err" disabled={busy || text.trim() !== PHRASE[scope]} onClick={run}>
              {busy && <Loader2 size={14} className="animate-spin" />} 영구 삭제 실행
            </button>
            <button className="btn btn-ghost" onClick={() => setScope(null)}>취소</button>
          </div>
          {err && <p className="mt-2 text-[13px] text-err">{err}</p>}
        </div>
      )}
    </Card>
  );
}


/* ---------- 입금 확인 대기 ---------- */
interface PendingOrder { orderId: string; plan: string; amount: number; depositorName: string | null; createdAt: string; expiresAt: string | null; expired: boolean; tenant: string }
interface LooseDeposit { tx_id: string; amount: number; depositor_name: string; occurred_at: string | null; status: string; created_at: string }

function PendingDeposits({ onChanged }: { onChanged: () => void }) {
  const [d, setD] = useState<{ orders: PendingOrder[]; deposits: LooseDeposit[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/payments", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(orderId: string, action: "confirm" | "cancel", txId?: string) {
    const ask = action === "confirm" ? "통장에서 입금을 확인하셨나요? 이용권이 바로 켜집니다." : "이 주문을 취소할까요?";
    if (!window.confirm(ask)) return;
    setBusy(orderId + action);
    setMsg("");
    const r = await fetch(`/api/admin/payments/${encodeURIComponent(orderId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, txId }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy("");
    setMsg(r?.ok ? (action === "confirm" ? "이용권을 켰습니다." : "주문을 취소했습니다.") : (j?.error ?? "처리하지 못했습니다."));
    await load();
    if (r?.ok) onChanged();
  }

  if (!d) return null;
  const live = d.orders.filter((o) => !o.expired);
  const stale = d.orders.filter((o) => o.expired);
  if (d.orders.length === 0 && d.deposits.length === 0) return null;
  return (
    <Card
      title={`입금 확인 대기 (${live.length})`}
      desc="입금 알림이 주문과 정확히 맞으면 자동으로 이용권이 켜집니다. 자동으로 안 켜진 건 통장을 확인하고 ‘입금 확인’을 눌러 주세요."
    >
      {msg && <p className="mb-3 rounded-xl bg-bg2 px-3 py-2 text-[13px]">{msg}</p>}
      {d.orders.length === 0 ? <p className="text-[13px] text-sub">대기 중인 주문이 없습니다.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="text-[13px] text-sub">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-left font-medium">학원</th>
                <th className="px-3 py-2 text-left font-medium">입금자명</th>
                <th className="px-3 py-2 text-right font-medium">금액</th>
                <th className="px-3 py-2 text-left font-medium">주문</th>
                <th className="px-3 py-2 text-right font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {[...live, ...stale].map((o) => (
                <tr key={o.orderId} className={`border-b border-bg2 ${o.expired ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2.5 font-semibold">{o.tenant}</td>
                  <td className="px-3 py-2.5">{o.depositorName ?? <span className="text-sub">아직 입력 전</span>}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{won(o.amount)}</td>
                  <td className="px-3 py-2.5 text-xs text-sub">{dt(o.createdAt)}{o.expired ? " · 만료됨" : ""}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => act(o.orderId, "confirm")}>
                        {busy === o.orderId + "confirm" && <Loader2 size={13} className="animate-spin" />} 입금 확인
                      </button>
                      <button className="btn btn-sm" disabled={!!busy} onClick={() => act(o.orderId, "cancel")}>취소</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.deposits.length > 0 && (
        <div className="mt-5">
          <p className="text-[13px] font-semibold">주문과 연결되지 않은 입금 알림 ({d.deposits.length})</p>
          <p className="mt-0.5 text-xs text-sub">금액이나 이름이 맞는 주문이 없었거나, 같은 조건의 주문이 여러 개라 자동으로 처리하지 않은 입금입니다. 위 주문 중 하나를 골라 ‘입금 확인’을 누르세요.</p>
          <ul className="mt-2 divide-y divide-bg2 rounded-xl border border-line text-[13px]">
            {d.deposits.map((x) => (
              <li key={x.tx_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span><b>{x.depositor_name}</b> · {won(x.amount)}</span>
                <span className="text-xs text-sub">{x.status === "ambiguous" ? "주문 여러 개와 일치" : "일치하는 주문 없음"} · {dt(x.occurred_at ?? x.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const AUDIT_LABEL: Record<string, string> = { delete_tenant: "학원 삭제", confirm_deposit: "입금 확인", cancel_order: "주문 취소", reset_data: "데이터 초기화", reset_all: "전체 삭제" };

/* ---------- 화면 ---------- */
const PERIODS: [string, string][] = [["1", "오늘"], ["7", "7일"], ["30", "30일"], ["90", "90일"], ["all", "전체"]];
type SortKey = "lastActivity" | "createdAt" | "projects" | "used" | "naverOpened" | "paidAmount" | "name";

export default function AdminView() {
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | TenantRow["state"]>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastActivity", desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/stats?days=${period}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const periodLabel = PERIODS.find(([v]) => v === period)?.[1] ?? "";
  const rows = useMemo(() => {
    if (!data) return [];
    const k = q.trim().toLowerCase();
    const list = data.tenants.filter(
      (t) => (stateFilter === "all" || t.state === stateFilter) && (!k || t.name.toLowerCase().includes(k) || (t.ownerEmail ?? "").toLowerCase().includes(k) || t.type.includes(k)),
    );
    const v = (t: TenantRow) => t[sort.key] as string | number;
    return [...list].sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * (sort.desc ? -1 : 1));
  }, [data, q, stateFilter, sort]);

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2.5 font-medium ${right ? "text-right" : "text-left"}`}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : true }))}>
        {children}
        {sort.key === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );

  const k = data?.kpis;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="운영자 대시보드"
        sub={data ? `기준 ${new Date(data.generatedAt).toLocaleString("ko-KR")} · 모든 숫자는 실제 DB 기준 · 운영자 계정은 통계에서 제외` : "불러오는 중"}
        actions={
          <>
            <div className="flex rounded-full bg-bg2 p-1" role="tablist" aria-label="기간">
              {PERIODS.map(([v, label]) => (
                <button key={v} role="tab" aria-selected={period === v}
                  className={`h-8 rounded-full px-3 text-[13px] ${period === v ? "bg-white font-semibold shadow-sm" : "text-sub"}`}
                  onClick={() => setPeriod(v)}>{label}</button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={load} disabled={loading} aria-label="새로고침">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto bg-bg2/60">
        <div className="mx-auto max-w-[1280px] space-y-5 px-5 py-6 md:px-8">
          {err && <p className="rounded-2xl bg-white p-4 text-err">{err}</p>}
          {!data && !err && <p className="flex items-center gap-2 text-sub"><Loader2 size={16} className="animate-spin" /> 통계를 계산하는 중…</p>}
          {data && k && (
            <>
              <PendingDeposits onChanged={load} />
              <div className="grid gap-5 lg:grid-cols-3">
                <Card title="사용자" desc={`${periodLabel} 기준 신규·활성`}>
                  <div className="grid grid-cols-2 gap-2">
                    <Tile label="가입 계정" value={n(k.users)} sub={`신규 +${n(k.usersNew)} · 메일 확인 ${n(k.usersConfirmed)}`} />
                    <Tile label="등록 학원" value={n(k.tenants)} sub={`신규 +${n(k.tenantsNew)}`} />
                    <Tile label="활성 학원" value={n(k.activeTenants)} sub={`${periodLabel} 안에 글을 만들거나 고친 학원`} />
                    <Tile label="무료 체험 중" value={n(k.trialing)} sub={`체험 소진 ${n(k.trialUsedUp)}곳`} />
                  </div>
                </Card>
                <Card title="콘텐츠" desc={`${periodLabel} 동안`}>
                  <div className="grid grid-cols-2 gap-2">
                    <Tile label="글 생성" value={`${n(k.generations)}건`} sub={`저장된 글 ${n(k.projectsCreated)}편 (실패 환불 반영)`} />
                    <Tile label="이미지" value={`${n(k.imageCards)}장`} sub={`AI 일러스트 ${n(k.aiImages)}장`} />
                    <Tile label="네이버 글쓰기 이동" value={`${n(k.naverOpened)}회`} sub={`복사 ${n(k.copied)}회`} />
                    <Tile label="발행 완료 표시" value={`${n(k.publishConfirmed)}건`} sub="사용자가 직접 누른 표시" hint="네이버 공식 연동이 아니므로 실제 발행 여부는 확인할 수 없습니다" />
                  </div>
                </Card>
                <Card title="매출·전환" desc="계좌이체 입금이 확인된 건 기준">
                  <div className="grid grid-cols-2 gap-2">
                    <Tile label="유료 학원" value={n(k.paying)} sub={`유료 전환율 ${pct(k.paidConversion)}`} />
                    <Tile label="결제 완료" value={`${n(k.paymentsCompleted)}건`} sub={`결제 시작 ${n(k.checkoutStarted)}건 · 완료율 ${pct(k.checkoutConversion)}`} />
                    <Tile label="실결제 매출" value={won(k.revenueLive)} sub={periodLabel} />
                    <Tile label="테스트 결제 금액" value={won(k.revenueTest)} sub="테스트 키로 처리된 금액(실제 돈 아님)" />
                  </div>
                </Card>
              </div>

              <Card title="일별 추이" desc="가입한 사람 수와 글 생성 건수(실패 환불 반영). 마우스를 올리면 그날 숫자가 보입니다.">
                <TrendChart data={data.trend} />
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="단계별 이탈" desc={`${periodLabel} 안에 가입한 사람 기준 · 주황 표시가 가장 많이 빠지는 단계`}>
                  <Funnel steps={data.funnel} />
                  <p className="mt-3 text-xs leading-5 text-sub">‘무료 체험 소진’은 무료 횟수를 다 썼거나 결제한 경우입니다. 네이버 이동과 발행 완료 표시는 퍼널에 넣지 않았습니다(발행은 사용자가 직접 누른 표시).</p>
                </Card>
                <Card title="학원 유형별 이용량" desc={`${periodLabel} 글 생성 건수`}>
                  <TypeBars rows={data.byType} />
                </Card>
              </div>

              <Card
                title={`학원 목록 (${rows.length}/${data.tenants.length})`}
                desc="줄을 누르면 학원 상세(만든 글·사용 기록·결제·행동 기록)가 열립니다."
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
                      <input className="field h-9 w-[200px] py-0 pl-8 text-[13px]" placeholder="학원명·이메일·유형" value={q} onChange={(e) => setQ(e.target.value)} />
                    </label>
                  </div>
                }
              >
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(["all", "trial", "trial_used_up", "paid", "expired"] as const).map((s) => (
                    <button key={s}
                      className={`h-8 rounded-full px-3 text-[13px] ${stateFilter === s ? "bg-ink font-semibold text-white" : "bg-bg2 text-ink"}`}
                      onClick={() => setStateFilter(s)}>
                      {s === "all" ? "전체" : STATE_LABEL[s]}
                      <span className="ml-1 opacity-70">{s === "all" ? data.tenants.length : data.tenants.filter((t) => t.state === s).length}</span>
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-[14px]">
                    <thead className="text-[13px] text-sub">
                      <tr className="border-b border-line">
                        <Th k="name">학원</Th>
                        <th className="px-3 py-2.5 text-left font-medium">상태</th>
                        <Th k="used" right>사용</Th>
                        <Th k="projects" right>만든 글</Th>
                        <Th k="naverOpened" right>네이버 이동</Th>
                        <Th k="paidAmount" right>결제</Th>
                        <Th k="createdAt">가입</Th>
                        <Th k="lastActivity">마지막 활동</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.id} className="cursor-pointer border-b border-bg2 hover:bg-bg2" onClick={() => setOpen(t.id)}>
                          <td className="px-3 py-3">
                            <p className="font-semibold">{t.name}</p>
                            <p className="text-xs text-sub">{t.type} · {t.ownerEmail ?? "소유자 없음"}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[t.state]}`}>{STATE_LABEL[t.state]}</span>
                            <p className="mt-1 text-xs text-sub">{t.plan}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{t.used}{t.limit !== null ? ` / ${t.limit}` : ""}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{t.projects}<span className="text-xs text-sub">{t.published ? ` · 발행 ${t.published}` : ""}</span></td>
                          <td className="px-3 py-3 text-right tabular-nums">{t.naverOpened}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{t.paidAmount ? `${won(t.paidAmount)}${t.paidMode === "test" ? " (테스트)" : ""}` : "-"}</td>
                          <td className="px-3 py-3 text-[13px] text-sub">{dt(t.createdAt)}</td>
                          <td className="px-3 py-3 text-[13px]">{ago(t.lastActivity)}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-8 text-center text-sub">조건에 맞는 학원이 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="최근 활동" desc="모든 학원의 최근 행동 40건(글 본문·개인정보는 기록하지 않음)">
                {data.recent.length === 0 ? <p className="text-[14px] text-sub">아직 기록된 활동이 없습니다.</p> : (
                  <ul className="divide-y divide-bg2">
                    {data.recent.map((e, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                        <span><b className="font-semibold">{e.tenant}</b> <span className="text-sub">·</span> {EVENT_LABEL[e.type] ?? e.type}</span>
                        <span className="shrink-0 text-[13px] text-sub" title={new Date(e.at).toLocaleString("ko-KR")}>{ago(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <ResetCard totals={data.totals} onDone={(m) => { setNote(m); load(); }} />

              <Card title="운영 작업 기록" desc="삭제·초기화 기록(초기화로도 지워지지 않음)">
                {data.audit.length === 0 ? <p className="text-[14px] text-sub">아직 기록이 없습니다.</p> : (
                  <ul className="divide-y divide-bg2">
                    {data.audit.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                        <span><b className="font-semibold">{AUDIT_LABEL[a.action] ?? a.action}</b>{a.target ? ` · ${a.target}` : ""} <span className="text-sub">· {a.admin_email ?? "-"}</span></span>
                        <span className="shrink-0 text-[13px] text-sub">{dt(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
      {note && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-2.5 text-[14px] text-white shadow-lg">
          <span>{note}</span>
          <button className="text-white/70 hover:text-white" onClick={() => setNote("")} aria-label="닫기"><X size={14} /></button>
        </div>
      )}
      {open && <TenantDrawer id={open} onClose={() => setOpen(null)} onDeleted={(m) => { setOpen(null); setNote(m); load(); }} />}
    </div>
  );
}
