"use client";

import { ArrowUp, Check, ChevronDown, Circle, Loader2, X } from "lucide-react";
import type { Brand } from "@/lib/settings";
import { formatTime, type DocRecord } from "@/lib/store";
import { PixelMark } from "./Logo";

export type StageStatus = "idle" | "running" | "done" | "error";
export type StageState = { analysis: StageStatus; plan: StageStatus; draft: StageStatus; images: StageStatus };
export interface Form {
  topic: string;
  contentType: string;
  memo: string;
  regionIndex: number | null;
  images: boolean;
}

const STEPS: { key: keyof StageState; label: string }[] = [
  { key: "analysis", label: "주제 분석" },
  { key: "plan", label: "콘텐츠 기획" },
  { key: "draft", label: "본문 작성·다듬기" },
  { key: "images", label: "이미지 구성" },
];

function StepIcon({ s }: { s: StageStatus }) {
  if (s === "done") return <Check size={15} className="text-ok" />;
  if (s === "running") return <Loader2 size={15} className="animate-spin text-brand" />;
  if (s === "error") return <X size={15} className="text-err" />;
  return <Circle size={13} className="text-line" />;
}

export default function ComposeView({
  form,
  setForm,
  brand,
  contentTypes,
  topicPlaceholder,
  exampleTopics,
  usageLabel,
  busy,
  stages,
  error,
  canResume,
  recent,
  onGenerate,
  onOpen,
  onHistory,
  notify,
}: {
  form: Form;
  setForm: (f: Form) => void;
  brand: Brand;
  contentTypes: string[];
  topicPlaceholder: string;
  exampleTopics: string[];
  usageLabel?: string;
  busy: boolean;
  stages: StageState;
  error: string | null;
  canResume: boolean;
  recent: DocRecord[];
  onGenerate: (resume: boolean) => void;
  onOpen: (id: string) => void;
  onHistory: () => void;
  notify: (m: string) => void;
}) {
  const showProgress = busy || !!error;
  const submit = () => {
    if (busy) return;
    if (form.topic.trim().length < 2) return notify("주제를 2자 이상 입력해 주세요.");
    onGenerate(false);
  };

  return (
    <div className="compose-hero relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="relative z-10 flex items-center justify-end gap-2 px-5 pt-4 md:px-8">
        {usageLabel && (
          <span className="rounded-full bg-white/80 px-3 py-1 text-[13px] font-semibold text-brand-dark ring-1 ring-line">{usageLabel}</span>
        )}
        <button className="btn btn-sm bg-white/80" onClick={onHistory}>
          작성 이력
        </button>
      </div>

      <form
        className="relative z-10 mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-5 pb-10 pt-6 md:px-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <PixelMark size={40} className="compose-mark" />
        <h1 className="compose-h">
          <span className="block">안녕하세요{brand.name ? `, ${brand.name}` : ""}.</span>
          <span className="block text-brand">어떤 글을 쓸까요?</span>
        </h1>

        <label htmlFor="topic" className="sr-only">글 주제</label>
        <div className={`compose-bar ${busy ? "is-busy" : ""}`}>
          <input
            id="topic"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-sub/80 md:text-[17px]"
            value={form.topic}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            placeholder={topicPlaceholder}
            autoFocus
          />
          <label htmlFor="ctype" className="sr-only">콘텐츠 유형</label>
          <span className="relative hidden shrink-0 sm:block">
            <select
              id="ctype"
              className="compose-select"
              value={form.contentType}
              disabled={busy}
              onChange={(e) => setForm({ ...form, contentType: e.target.value })}
            >
              {contentTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sub" />
          </span>
          <button type="submit" className="compose-go" disabled={busy || form.topic.trim().length < 2} aria-label="글 생성">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.4} />}
          </button>
        </div>

        {/* 좁은 화면에서는 유형 선택을 입력창 아래에 */}
        <select
          aria-label="콘텐츠 유형"
          className="compose-select mt-3 self-stretch sm:hidden"
          value={form.contentType}
          disabled={busy}
          onChange={(e) => setForm({ ...form, contentType: e.target.value })}
        >
          {contentTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <label htmlFor="memo" className="sr-only">현장 메모</label>
        <textarea
          id="memo"
          className="field mt-3 min-h-[64px] w-full resize-y bg-white/80 text-[14px]"
          value={form.memo}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
          placeholder="(선택) 현장 메모: 이번 주 수업·상담에서 있었던 일을 한두 줄 적으면 그 이야기를 중심으로 씁니다. 예) 중3 반 절반이 근의 공식에서 부호를 틀림"
        />

        {!form.topic.trim() && !busy && exampleTopics.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {exampleTopics.map((x) => (
              <button key={x} type="button" className="compose-chip" onClick={() => setForm({ ...form, topic: x })}>
                {x}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-sub">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.images} disabled={busy} onChange={(e) => setForm({ ...form, images: e.target.checked })} />
            이미지 함께 만들기
          </label>
          {brand.regionHashtagGroups.length > 0 && (
            <label className="flex items-center gap-1.5">
              지역 해시태그
              <select
                id="region"
                className="rounded-md bg-transparent py-0.5 text-[13px] text-ink outline-none"
                value={form.regionIndex ?? ""}
                disabled={busy}
                onChange={(e) => setForm({ ...form, regionIndex: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">자동</option>
                {brand.regionHashtagGroups.map((g, i) => (
                  <option key={i} value={i}>
                    {g.slice(0, 3).join(" · ")} 외
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {showProgress && (
          <section className="mt-8 w-full rounded-2xl bg-white/85 px-5 py-4 ring-1 ring-line" aria-live="polite">
            <ol className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[14px]">
              {STEPS.filter((s) => s.key !== "images" || form.images).map((s) => (
                <li key={s.key} className={`flex items-center gap-2 ${stages[s.key] === "idle" ? "text-sub" : ""}`}>
                  <StepIcon s={stages[s.key]} /> {s.label}
                </li>
              ))}
            </ol>
            {busy && <p className="mt-3 text-center text-xs text-sub">보통 1~2분 걸립니다. 이 화면을 벗어나지 말아 주세요.</p>}
            {error && (
              <p className="mt-3 border-l-2 border-err bg-bg2 px-3 py-2 text-[14px] leading-6">
                {error}
                {canResume && <span className="text-sub"> 완료된 단계는 보존되어 있습니다.</span>}
              </p>
            )}
            {error && !busy && canResume && (
              <div className="mt-3 text-center">
                <button type="button" className="btn h-10" onClick={() => onGenerate(true)}>
                  실패한 단계부터 이어서 생성
                </button>
              </div>
            )}
          </section>
        )}
      </form>

      {recent.length > 0 && (
        <section className="relative z-10 mx-auto w-full max-w-[760px] px-5 pb-8 md:px-8">
          <p className="label">최근 작성한 콘텐츠</p>
          <ul className="rounded-2xl bg-white/80 px-4 ring-1 ring-line">
            {recent.map((d) => (
              <li key={d.id} className="flex items-baseline gap-3 border-b border-bg2 py-2.5 text-[14px] last:border-0">
                <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(d.id)}>
                  {d.title}
                </button>
                <span className="shrink-0 text-xs text-sub">{formatTime(d.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
