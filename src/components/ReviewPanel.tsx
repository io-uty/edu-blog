"use client";

import { Check, ChevronRight, Dot } from "lucide-react";
import { HUMAN_REVIEW_NOTICE, buildChecks } from "@/lib/checks";
import { findBlock } from "@/lib/locate";
import { formatTime, type DocRecord, type Quality } from "@/lib/store";

export default function ReviewPanel({
  doc,
  quality,
  onJump,
}: {
  doc: DocRecord;
  quality: Quality;
  onJump: (blockId: string) => void;
}) {
  const rows = buildChecks(quality);
  return (
    <div className="text-[14px]">
      <section className="border-b border-line px-5 py-4">
        <p className="label">검토 항목</p>
        <ul>
          {rows.map((r) => {
            const head = (
              <div className="flex w-full items-center gap-2 py-1.5">
                {r.ok ? <Check size={14} className="text-ok" /> : <Dot size={16} className="-mx-px text-ink" />}
                <span className="flex-1">{r.label}</span>
                <span className={r.ok ? "text-sub" : "text-ink"}>{r.value}</span>
                {!r.ok && <ChevronRight size={14} className="text-sub transition-transform group-open:rotate-90" />}
              </div>
            );
            return (
              <li key={r.key} className="border-b border-bg2 last:border-0">
                {r.ok ? (
                  head
                ) : (
                  <details className="group">
                    <summary className="cursor-pointer list-none">{head}</summary>
                    <ul className="space-y-1.5 pb-2 pl-6">
                      {r.issues.map((it, i) => {
                        const blk = findBlock(doc.draft, it.excerpt);
                        return (
                          <li key={i} className="text-xs leading-5">
                            {it.message}
                            {it.excerpt && <span className="ml-1 bg-bg2 px-1 text-sub">{it.excerpt}</span>}
                            {blk && (
                              <button className="ml-1 text-sub underline underline-offset-2 hover:text-ink" onClick={() => onJump(blk)}>
                                이동
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-sub">{HUMAN_REVIEW_NOTICE}</p>
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
          <Row k="본문 분량" v={`${quality.charCount.toLocaleString()}자`} />
          <Row k="소주제" v={`${doc.draft.sections.length}개`} />
          <Row k="이미지" v={`${doc.images?.length ?? 0}장`} />
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
