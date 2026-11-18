"use client";

import { Check, ChevronRight, Circle, Loader2, X } from "lucide-react";
import type { Brand } from "@/lib/settings";
import { formatTime, type DocRecord } from "@/lib/store";
import { PageHeader } from "./ui";

export type StageStatus = "idle" | "running" | "done" | "error";
export type StageState = { analysis: StageStatus; plan: StageStatus; draft: StageStatus; images: StageStatus };
export interface Form {
  topic: string;
  contentType: string;
  regionIndex: number | null;
  images: boolean;
}

const STEPS: { key: keyof StageState; label: string }[] = [
  { key: "analysis", label: "주제 분석" },
  { key: "plan", label: "콘텐츠 기획" },
  { key: "draft", label: "본문 작성" },
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="새 블로그 글 작성"
        status="작성 전 · 생성하면 자동 저장됩니다"
        actions={
          <button className="btn" onClick={onHistory}>
            작성 이력
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <form
          className="mx-auto max-w-[720px] px-5 py-8 md:px-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (form.topic.trim().length < 2) return notify("주제를 2자 이상 입력해 주세요.");
            onGenerate(false);
          }}
        >
          <div className="mb-6">
            <label htmlFor="topic" className="label">주제</label>
            <input
              id="topic"
              className="field h-11 text-[15px]"
              value={form.topic}
              maxLength={200}
              disabled={busy}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder={topicPlaceholder}
              autoFocus
            />
            <p className="mt-1.5 text-xs text-sub">주제만 입력해도 생성할 수 있습니다.</p>
          </div>

          <div className="mb-6 sm:w-[320px]">
            <label htmlFor="ctype" className="label">콘텐츠 유형</label>
            <select
              id="ctype"
              className="field h-9 py-0"
              value={form.contentType}
              disabled={busy}
              onChange={(e) => setForm({ ...form, contentType: e.target.value })}
            >
              {contentTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <label className="mb-6 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.images}
              disabled={busy}
              onChange={(e) => setForm({ ...form, images: e.target.checked })}
            />
            이미지 함께 만들기 <span className="text-sub">(썸네일 + 소주제별, 1:1)</span>
          </label>

          <details className="group mb-8 border-t border-line pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] text-sub hover:text-ink">
              <ChevronRight size={14} className="transition-transform group-open:rotate-90" /> 고급 설정
            </summary>
            <div className="mt-4 sm:w-[320px]">
              <label htmlFor="region" className="label">지역 해시태그 묶음</label>
              <select
                id="region"
                className="field h-9 py-0"
                value={form.regionIndex ?? ""}
                disabled={busy}
                onChange={(e) => setForm({ ...form, regionIndex: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">자동 (주제별로 순환)</option>
                {brand.regionHashtagGroups.map((g, i) => (
                  <option key={i} value={i}>
                    {g.slice(0, 3).join(" · ")} 외
                  </option>
                ))}
              </select>
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn btn-primary h-10 px-6 text-sm" disabled={busy}>
              {busy ? <><Loader2 size={15} className="animate-spin" /> 생성 중</> : "글 생성"}
            </button>
            {error && !busy && canResume && (
              <button type="button" className="btn h-10" onClick={() => onGenerate(true)}>
                실패한 단계부터 이어서 생성
              </button>
            )}
          </div>

          {showProgress && (
            <section className="mt-8 border-t border-line pt-5" aria-live="polite">
              <ol className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
                {STEPS.filter((s) => s.key !== "images" || form.images).map((s) => (
                  <li key={s.key} className={`flex items-center gap-2 ${stages[s.key] === "idle" ? "text-sub" : ""}`}>
                    <StepIcon s={stages[s.key]} /> {s.label}
                  </li>
                ))}
              </ol>
              {busy && <p className="mt-3 text-xs text-sub">보통 1~2분 걸립니다. 이 화면을 벗어나지 말아 주세요.</p>}
              {error && (
                <p className="mt-3 border-l-2 border-err bg-bg2 px-3 py-2 text-[13px] leading-6">
                  {error}
                  {canResume && <span className="text-sub"> 완료된 단계는 보존되어 있습니다.</span>}
                </p>
              )}
            </section>
          )}
        </form>

        {recent.length > 0 && (
          <section className="mx-auto max-w-[720px] border-t border-line px-5 py-6 md:px-8">
            <p className="label">최근 작성한 콘텐츠</p>
            <ul>
              {recent.map((d) => (
                <li key={d.id} className="flex items-baseline gap-3 border-b border-bg2 py-2 text-[13px]">
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
    </div>
  );
}
