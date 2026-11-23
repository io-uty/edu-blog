"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { formatTime, type DocRecord, type HistoryEntry } from "@/lib/store";
import { PageHeader } from "./ui";

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-24 text-center">
      <FileText size={28} className="text-sub" strokeWidth={1.5} />
      <p className="text-sub">{text}</p>
      {action}
    </div>
  );
}

export function ListView({
  docs,
  onOpen,
  onPublish,
  onDelete,
  onNew,
}: {
  docs: DocRecord[];
  onOpen: (id: string) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="콘텐츠 목록" sub={`${docs.length}건`} actions={<button className="btn btn-primary" onClick={onNew}>새 콘텐츠 작성</button>} />
      <div className="flex-1 overflow-auto">
        {docs.length === 0 ? (
          <Empty text="저장된 콘텐츠가 없습니다." action={<button className="btn btn-primary" onClick={onNew}>첫 글 작성하기</button>} />
        ) : (
          <ul className="divide-y divide-bg2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#fcfaf8] sm:flex-row sm:items-center sm:gap-6 md:px-8">
                <div className="min-w-0 flex-1">
                  <button className="line-clamp-2 text-left text-[15px] font-semibold leading-snug hover:underline" onClick={() => onOpen(d.id)}>
                    {d.title}
                  </button>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-sub">
                    {d.mock ? <span>샘플</span> : d.status === "published_confirmed" ? <span className="font-medium text-ok">발행 완료</span> : <span>작성 중</span>}
                    <span aria-hidden>·</span>
                    <span>{d.contentType}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{formatTime(d.updatedAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="btn btn-sm" onClick={() => onOpen(d.id)}>편집</button>
                  <button className="btn btn-sm" onClick={() => onPublish(d.id)}>발행 준비</button>
                  <button
                    className={`btn btn-sm ${confirm === d.id ? "border-err text-err" : ""}`}
                    onClick={() => {
                      if (confirm === d.id) {
                        onDelete(d.id);
                        setConfirm(null);
                      } else {
                        setConfirm(d.id);
                        setTimeout(() => setConfirm((c) => (c === d.id ? null : c)), 3000);
                      }
                    }}
                    aria-label={confirm === d.id ? "한 번 더 눌러 삭제" : "삭제"}
                  >
                    <Trash2 size={13} /> {confirm === d.id ? "한 번 더 눌러 삭제" : ""}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function HistoryView({ history, onOpen, hasDoc }: { history: HistoryEntry[]; onOpen: (id: string) => void; hasDoc: (id: string) => boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="생성 이력" sub={`${history.length}건 · 이 브라우저에 저장됨`} />
      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <Empty text="아직 생성 이력이 없습니다." />
        ) : (
          <ul className="divide-y divide-bg2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-6 md:px-8">
                <span className="shrink-0 text-xs tabular-nums text-sub sm:w-[130px]">{formatTime(h.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px]">{h.topic}</p>
                  <p className="text-xs text-sub">
                    {h.contentType} · {h.mock ? "샘플" : "AI 생성"}
                  </p>
                </div>
                <div className="shrink-0 text-[14px]">
                  {h.outcome === "success" ? (
                    h.docId && hasDoc(h.docId) ? (
                      <button className="underline underline-offset-2" onClick={() => onOpen(h.docId!)}>완료 · 열기</button>
                    ) : (
                      <span className="text-sub">완료 (삭제됨)</span>
                    )
                  ) : (
                    <span className="text-err">실패{h.message ? ` · ${h.message}` : ""}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
