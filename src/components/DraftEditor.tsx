"use client";

import { EXAMPLE_LABEL } from "@/lib/render";
import type { Draft } from "@/lib/schemas";

// 문단 배열 <-> 빈 줄로 구분된 텍스트
const join = (ps: string[]) => ps.join("\n\n");
const split = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

function Area({ value, onChange, rows = 5 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border px-3 py-2 text-[15px] leading-7 outline-none focus:border-brand"
    />
  );
}

export default function DraftEditor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const setSection = (i: number, patch: Partial<Draft["sections"][number]>) =>
    onChange({ ...draft, sections: draft.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">본문 편집</h2>
        <span className="text-xs text-slate-500">문단은 빈 줄로 구분 · 수정 시 품질 검사 자동 재실행</span>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-600">도입부</p>
        <Area value={join(draft.introduction)} onChange={(v) => onChange({ ...draft, introduction: split(v) })} />
      </div>

      {draft.sections.map((s, i) => (
        <div key={i} className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand">{i + 1}.</span>
            <input
              value={s.heading}
              onChange={(e) => setSection(i, { heading: e.target.value })}
              className="flex-1 rounded-lg border px-3 py-1.5 font-semibold"
            />
          </div>
          <Area value={join(s.paragraphs)} onChange={(v) => setSection(i, { paragraphs: split(v) })} rows={7} />
          {s.bullets && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">항목 목록 (한 줄에 하나)</p>
              <Area
                value={s.bullets.join("\n")}
                onChange={(v) => {
                  const items = v.split("\n").map((t) => t.trim()).filter(Boolean);
                  setSection(i, { bullets: items.length ? items : null });
                }}
                rows={Math.max(3, s.bullets.length)}
              />
            </div>
          )}
          {s.table && (
            <div className="overflow-x-auto">
              <table className="w-full border text-sm">
                <thead className="bg-slate-50">
                  <tr>{s.table.headers.map((h, k) => <th key={k} className="border px-2 py-1">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, k) => (
                    <tr key={k}>{r.map((c, m) => <td key={m} className="border px-2 py-1">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setSection(i, { table: null })} className="mt-1 text-xs text-red-600">
                표 삭제
              </button>
            </div>
          )}
          {s.example && (
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>
                  {s.example.kind === "practice" ? "연습용 예문" : "예시"}{" "}
                  {s.example.is_fictional ? `· ${EXAMPLE_LABEL[s.example.kind]}` : "· ⚠ 실제 사례로 표시됨 (근거 필요)"}
                </span>
                <button onClick={() => setSection(i, { example: null })} className="text-red-600">
                  예시 삭제
                </button>
              </div>
              <Area
                value={s.example.text}
                onChange={(v) => setSection(i, { example: { ...s.example!, text: v } })}
                rows={3}
              />
            </div>
          )}
        </div>
      ))}

      <div className="border-t pt-4">
        <p className="mb-1 text-sm font-medium text-slate-600">마무리 (소제목 &ldquo;에듀윌 편입 강남학원 상담 안내&rdquo; 자동)</p>
        <Area value={join(draft.conclusion)} onChange={(v) => onChange({ ...draft, conclusion: split(v) })} rows={4} />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-600">해시태그 (쉼표 또는 공백 구분)</p>
        <input
          value={draft.hashtags.join(", ")}
          onChange={(e) =>
            onChange({
              ...draft,
              hashtags: e.target.value
                .split(/[,\s]+/)
                .map((t) => t.replace(/^#/, ""))
                .filter(Boolean),
            })
          }
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
