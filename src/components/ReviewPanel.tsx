"use client";

import { Check, ChevronRight, Minus, TriangleAlert } from "lucide-react";
import { buildChecks, type Tone } from "@/lib/checks";
import { findBlock } from "@/lib/locate";
import { STATUS_LABEL, formatTime, type DocRecord } from "@/lib/store";

const TONE_TEXT: Record<Tone, string> = { ok: "text-ink", warn: "text-warn", err: "text-err font-semibold", muted: "text-sub" };

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "ok") return <Check size={14} className="text-ok" />;
  if (tone === "muted") return <Minus size={14} className="text-sub" />;
  return <TriangleAlert size={14} className={tone === "err" ? "text-err" : "text-warn"} />;
}

export default function ReviewPanel({ doc, onJump }: { doc: DocRecord; onJump: (blockId: string) => void }) {
  const rows = buildChecks(doc.quality);
  const statusTone = doc.quality.status === "FAILED" ? "text-err" : "text-warn";

  return (
    <div className="text-[13px]">
      <section className="border-b border-line px-5 py-4">
        <p className="label">검수 상태</p>
        <p className={`text-[15px] font-semibold ${statusTone}`}>{STATUS_LABEL[doc.quality.status]}</p>
      </section>

      <section className="border-b border-line px-5 py-4">
        <p className="label">검증 결과</p>
        <ul>
          {rows.map((r) => {
            const hasDetail = r.issues.length > 0 || !!r.note;
            const head = (
              <div className="flex w-full items-center gap-2 py-1.5">
                <ToneIcon tone={r.tone} />
                <span className="flex-1">{r.label}</span>
                <span className={TONE_TEXT[r.tone]}>{r.value}</span>
                {hasDetail && <ChevronRight size={14} className="text-sub transition-transform group-open:rotate-90" />}
              </div>
            );
            return (
              <li key={r.key} className="border-b border-bg2 last:border-0">
                {hasDetail ? (
                  <details className="group" open={r.tone === "err"}>
                    <summary className="cursor-pointer list-none">{head}</summary>
                    <div className="pb-2 pl-6">
                      {r.note && <p className="mb-1 text-xs leading-5 text-sub">{r.note}</p>}
                      <ul className="space-y-1.5">
                        {r.issues.map((it, i) => {
                          const blk = findBlock(doc.draft, it.excerpt);
                          return (
                            <li key={i} className="text-xs leading-5">
                              <span className={it.severity === "error" ? "text-err" : "text-ink"}>{it.message}</span>
                              {it.excerpt && <span className="ml-1 bg-bg2 px-1 text-sub">{it.excerpt}</span>}
                              {blk && (
                                <button className="ml-1 text-brand underline underline-offset-2" onClick={() => onJump(blk)}>
                                  이동
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </details>
                ) : (
                  head
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs leading-5 text-sub">검사 통과는 사실 정확성을 보장하지 않습니다.</p>
      </section>

      <section className="border-b border-line px-5 py-4">
        <p className="label">SEO 정보</p>
        <dl className="space-y-1.5 text-xs">
          <Row k="제목 길이" v={`${doc.draft.title.length}자`} />
          <Row k="해시태그" v={`${doc.draft.hashtags.length}개`} />
          <div>
            <dt className="text-sub">키워드 계획</dt>
            <dd className="mt-0.5 leading-5">{doc.plan.keyword_plan}</dd>
          </div>
        </dl>
      </section>

      <section className="px-5 py-4">
        <p className="label">문서 정보</p>
        <dl className="space-y-1.5 text-xs">
          <Row k="콘텐츠 유형" v={doc.contentType} />
          <Row k="본문 분량" v={`${doc.quality.charCount.toLocaleString()}자`} />
          <Row k="소주제" v={`${doc.draft.sections.length}개`} />
          <Row k="생성 방식" v={doc.mock ? "샘플 데이터" : "AI 생성"} />
          <Row k="생성" v={formatTime(doc.createdAt)} />
          <Row k="최종 수정" v={formatTime(doc.updatedAt)} />
        </dl>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
