"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { EXAMPLE_LABEL } from "@/lib/render";
import type { Draft } from "@/lib/schemas";
import { resolveBrand, type Settings } from "@/lib/settings";
import { displayName, type TenantProfile } from "@/lib/tenant";
import { sortImages, type ImageItem } from "@/lib/store";
import { ImageSlot, type ImageActions } from "./images";

const join = (ps: string[]) => ps.join("\n\n");
const split = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

type Action = "polish" | "shorten" | "expand" | "simplify" | "professional";
const ACTIONS: { key: Action; label: string }[] = [
  { key: "polish", label: "문장 다듬기" },
  { key: "shorten", label: "길이 줄이기" },
  { key: "expand", label: "길이 늘리기" },
  { key: "simplify", label: "쉬운 표현" },
  { key: "professional", label: "전문적인 표현" },
];

interface Sel {
  field: string;
  start: number;
  end: number;
}
interface Refine extends Sel {
  action: Action;
  original: string;
  status: "loading" | "ready" | "error";
  result?: string;
  error?: string;
}

/** 내용에 맞춰 높이가 자동 조절되는 문서 필드 */
function AutoArea({
  value,
  onChange,
  className = "",
  onSelect,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  onSelect?: (start: number, end: number) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);
  useLayoutEffect(fit, [value, fit]);
  // 패널을 여닫거나 글꼴이 늦게 로드되어 칸 폭·글자 폭이 바뀌어도 높이를 다시 맞춘다
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => ro.disconnect();
  }, [fit]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onSelect={
        onSelect
          ? (e) => {
              const t = e.currentTarget;
              onSelect(t.selectionStart, t.selectionEnd);
            }
          : undefined
      }
      className={`doc-field ${className}`}
    />
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState<string | null>(null); // 입력 중에만 로컬 텍스트 사용
  const shown = text ?? tags.map((t) => `#${t}`).join(" ");
  return (
    <input
      className="field"
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, ""))
            .filter(Boolean),
        );
      }}
      onBlur={() => setText(null)}
    />
  );
}

export default function DocEditor({
  draft,
  onChange,
  aiEnabled,
  settings,
  tenant,
  images,
  imageActions,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  aiEnabled: boolean;
  settings: Settings;
  tenant: TenantProfile | null;
  images: ImageItem[];
  imageActions: ImageActions;
}) {
  const shownBrand = resolveBrand(settings.brand, tenant ? displayName(tenant) : "");
  const sorted = sortImages(images);
  const thumb = sorted.find((i) => i.kind === "thumbnail");
  const sectionImage = (i: number) => sorted.find((it) => it.kind === "section" && it.sectionIndex === i);
  const numberOf = (it?: ImageItem) => (it ? sorted.indexOf(it) + 1 : 0);
  const prefix = (i: number) =>
    settings.format.headingPrefix === "number" ? `${i + 1}.` : settings.format.headingPrefix === "dash" ? "-" : "";
  const [sel, setSel] = useState<Sel | null>(null);
  const [refine, setRefine] = useState<Refine | null>(null);
  const reqId = useRef(0);

  const setSection = (i: number, patch: Partial<Draft["sections"][number]>) =>
    onChange({ ...draft, sections: draft.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  // 필드 id → 현재 문자열 / 쓰기
  const fields: Record<string, { get: () => string; set: (v: string) => void }> = {
    intro: { get: () => join(draft.introduction), set: (v) => onChange({ ...draft, introduction: split(v) }) },
    concl: { get: () => join(draft.conclusion), set: (v) => onChange({ ...draft, conclusion: split(v) }) },
  };
  draft.sections.forEach((s, i) => {
    fields[`s${i}`] = { get: () => join(s.paragraphs), set: (v) => setSection(i, { paragraphs: split(v) }) };
  });

  function onFieldSelect(field: string, start: number, end: number) {
    if (refine?.status === "loading") return;
    if (end - start >= 2) {
      if (!refine || refine.field !== field) setRefine(null);
      setSel({ field, start, end });
    } else if (!refine) {
      setSel(null);
    }
  }

  async function runRefine(action: Action) {
    if (!sel) return;
    const original = fields[sel.field].get().slice(sel.start, sel.end);
    const id = ++reqId.current;
    setRefine({ ...sel, action, original, status: "loading" });
    try {
      const r = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: original, brand: settings.brand, tenant }),
      });
      const j = await r.json().catch(() => ({}));
      if (id !== reqId.current) return;
      if (!r.ok) throw new Error(j.error || "문장 수정에 실패했습니다.");
      setRefine((p) => (p ? { ...p, status: "ready", result: j.text } : p));
    } catch (e) {
      if (id !== reqId.current) return;
      setRefine((p) => (p ? { ...p, status: "error", error: e instanceof Error ? e.message : "문장 수정에 실패했습니다." } : p));
    }
  }

  function applyRefine() {
    if (!refine || refine.status !== "ready" || refine.result == null) return;
    const f = fields[refine.field];
    const cur = f.get();
    if (cur.slice(refine.start, refine.end) !== refine.original) {
      setRefine({ ...refine, status: "error", error: "선택한 문장이 그 사이 수정되었습니다. 다시 선택해 주세요." });
      return;
    }
    f.set(cur.slice(0, refine.start) + refine.result + cur.slice(refine.end));
    setRefine(null);
    setSel(null);
  }

  const cancelRefine = () => {
    reqId.current++;
    setRefine(null);
    setSel(null);
  };

  /** 본문 필드 + 선택 시 나타나는 인라인 도구 */
  const renderBody = (field: string) => {
    const active = sel?.field === field;
    return (
      <div>
        <AutoArea
          value={fields[field].get()}
          onChange={fields[field].set}
          onSelect={(s, e) => onFieldSelect(field, s, e)}
          className="doc-p"
        />
        {active && !refine && (
          <div
            className="mt-1 flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-white p-1.5 shadow-sm"
            onMouseDown={(e) => e.preventDefault()}
            role="toolbar"
            aria-label="선택한 문장 편집"
          >
            <span className="px-2 text-xs text-sub">선택 {sel!.end - sel!.start}자</span>
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                className="btn btn-sm"
                disabled={!aiEnabled}
                title={aiEnabled ? "" : "API 키 설정 후 사용할 수 있습니다"}
                onClick={() => runRefine(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {refine && refine.field === field && (
          <div className="mt-1 rounded-2xl border border-line bg-bg2 p-4 text-[14px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{ACTIONS.find((a) => a.key === refine.action)?.label} · 적용 전 미리보기</span>
              <button className="btn btn-ghost btn-sm" onClick={cancelRefine} aria-label="닫기">
                <X size={14} />
              </button>
            </div>
            {refine.status === "loading" && (
              <p className="flex items-center gap-2 text-sub">
                <Loader2 size={14} className="animate-spin" /> 수정안을 만드는 중입니다. 원문은 그대로 유지됩니다.
              </p>
            )}
            {refine.status === "error" && (
              <div>
                <p className="text-err">{refine.error}</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-sm" onClick={() => runRefine(refine.action)}>다시 시도</button>
                  <button className="btn btn-sm" onClick={cancelRefine}>닫기</button>
                </div>
              </div>
            )}
            {refine.status === "ready" && (
              <div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="label">현재</p>
                    <p className="whitespace-pre-wrap leading-6 text-sub line-through decoration-[#ccc]">{refine.original}</p>
                  </div>
                  <div>
                    <p className="label">수정안</p>
                    <p className="whitespace-pre-wrap leading-6">{refine.result}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={applyRefine}>적용</button>
                  <button className="btn btn-sm" onClick={() => runRefine(refine.action)}>다시 만들기</button>
                  <button className="btn btn-sm" onClick={cancelRefine}>취소</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <article className="mx-auto w-full max-w-[760px] px-5 py-10 md:px-10">
      <div id="blk-title" className="mb-8 border-b border-line pb-6">
        <AutoArea
          value={draft.title}
          onChange={(v) => onChange({ ...draft, title: v.replace(/\n/g, " ") })}
          className="doc-title"
          placeholder="제목"
        />
      </div>

      <ImageSlot target={{ kind: "thumbnail", sectionIndex: null }} item={thumb} number={numberOf(thumb)} actions={imageActions} />

      {shownBrand.greeting && (
        <p className="doc-p mb-6 text-sub" title="블로그 설정의 고정 인사말입니다">{shownBrand.greeting}</p>
      )}

      <div id="blk-intro" className="mb-10">
        {renderBody("intro")}
      </div>

      {draft.sections.map((s, i) => (
        <section id={`blk-s${i}`} key={i} className="mb-10 scroll-mt-4">
          <div className="mb-2 flex items-baseline gap-2">
            {prefix(i) && <span className="doc-h2 text-brand">{prefix(i)}</span>}
            <div className="flex-1">
              <AutoArea value={s.heading} onChange={(v) => setSection(i, { heading: v.replace(/\n/g, " ") })} className="doc-h2" />
            </div>
          </div>

          <ImageSlot
            target={{ kind: "section", sectionIndex: i }}
            item={sectionImage(i)}
            number={numberOf(sectionImage(i))}
            actions={imageActions}
          />

          {renderBody(`s${i}`)}

          {s.bullets && (
            <div className="my-2 border-l-2 border-line pl-4">
              <p className="label">항목 (한 줄에 하나)</p>
              <AutoArea
                value={s.bullets.join("\n")}
                onChange={(v) => {
                  const items = v.split("\n").map((t) => t.trim()).filter(Boolean);
                  setSection(i, { bullets: items.length ? items : null });
                }}
                className="doc-p"
              />
            </div>
          )}

          {s.table && (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr>
                    {s.table.headers.map((h, k) => (
                      <th key={k} className="border border-line bg-bg2 p-0">
                        <input
                          value={h}
                          onChange={(e) => {
                            const headers = s.table!.headers.map((x, m) => (m === k ? e.target.value : x));
                            setSection(i, { table: { ...s.table!, headers } });
                          }}
                          className="w-full bg-transparent px-2 py-1.5 text-center font-semibold outline-none focus:bg-white"
                          aria-label={`표 머리글 ${k + 1}`}
                        />
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, k) => (
                    <tr key={k}>
                      {r.map((c, m) => (
                        <td key={m} className="border border-line p-0">
                          <input
                            value={c}
                            onChange={(e) => {
                              const rows = s.table!.rows.map((row, a) => (a === k ? row.map((x, b) => (b === m ? e.target.value : x)) : row));
                              setSection(i, { table: { ...s.table!, rows } });
                            }}
                            className="w-full bg-transparent px-2 py-1.5 outline-none focus:bg-[#fafafa]"
                            aria-label={`표 ${k + 1}행 ${m + 1}열`}
                          />
                        </td>
                      ))}
                      <td className="text-center">
                        <button
                          className="p-1 text-sub hover:text-err disabled:opacity-30"
                          disabled={s.table!.rows.length <= 1}
                          title="행 삭제"
                          onClick={() => setSection(i, { table: { ...s.table!, rows: s.table!.rows.filter((_, a) => a !== k) } })}
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1 flex gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => setSection(i, { table: { ...s.table!, rows: [...s.table!.rows, s.table!.headers.map(() => "")] } })}
                >
                  <Plus size={14} /> 행 추가
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setSection(i, {
                      table: { headers: [...s.table!.headers, "새 열"], rows: s.table!.rows.map((r) => [...r, ""]) },
                    })
                  }
                >
                  <Plus size={14} /> 열 추가
                </button>
                <button
                  className="btn btn-sm"
                  disabled={s.table.headers.length <= 2}
                  onClick={() =>
                    setSection(i, {
                      table: { headers: s.table!.headers.slice(0, -1), rows: s.table!.rows.map((r) => r.slice(0, -1)) },
                    })
                  }
                >
                  열 삭제
                </button>
                <button className="btn btn-sm btn-ghost ml-auto" onClick={() => setSection(i, { table: null })}>
                  <Trash2 size={14} /> 표 삭제
                </button>
              </div>
            </div>
          )}

          {s.example && (
            <div className="my-4 rounded-2xl border-l-4 border-brand bg-bg2 px-4 py-3">
              <div className="mb-1 flex items-center justify-between text-xs text-sub">
                <span>
                  {s.example.kind === "practice" ? "연습용 예문" : "예시"} ·{" "}
                  {s.example.is_fictional ? EXAMPLE_LABEL[s.example.kind] : "실제 사례로 표시됨 (근거 필요)"}
                </span>
                <button className="hover:text-err" onClick={() => setSection(i, { example: null })}>
                  예시 삭제
                </button>
              </div>
              <AutoArea
                value={s.example.text}
                onChange={(v) => setSection(i, { example: { ...s.example!, text: v } })}
                className="doc-p"
              />
            </div>
          )}
        </section>
      ))}

      <section id="blk-concl" className="mb-10">
        {shownBrand.closingHeading && <p className="doc-h2 mb-2">{shownBrand.closingHeading}</p>}
        {renderBody("concl")}
      </section>

      <section id="blk-tags" className="border-t border-line pt-5">
        <p className="label">해시태그 (쉼표 또는 공백으로 구분)</p>
        <TagInput tags={draft.hashtags} onChange={(hashtags) => onChange({ ...draft, hashtags })} />
        <p className="mt-4 text-xs text-sub">
          {shownBrand.bookingUrl ? `본문 끝에 예약 링크가 자동으로 붙습니다: ${shownBrand.bookingUrl}` : "블로그 설정에 예약·문의 링크를 넣으면 본문 끝에 자동으로 붙습니다."}
        </p>
      </section>
    </article>
  );
}
