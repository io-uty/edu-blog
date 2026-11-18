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
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="sticky top-0 bg-white text-xs text-sub">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium md:px-8">제목</th>
                <th className="px-3 py-2.5 font-medium">유형</th>
                <th className="px-3 py-2.5 font-medium">상태</th>
                <th className="px-3 py-2.5 font-medium">수정일</th>
                <th className="px-5 py-2.5 md:px-8" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-bg2 hover:bg-[#fafafa]">
                  <td className="max-w-[420px] px-5 py-3 md:px-8">
                    <button className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => onOpen(d.id)}>
                      {d.title}
                    </button>
                    <span className="block truncate text-xs text-sub">{d.topic}</span>
                  </td>
                  <td className="px-3 py-3 text-sub">{d.contentType}</td>
                  <td className="px-3 py-3">
                    {d.mock ? <span className="text-sub">샘플</span> : d.status === "published_confirmed" ? <span className="text-ok">발행 완료</span> : <span className="text-sub">작성 중</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-sub">{formatTime(d.updatedAt)}</td>
                  <td className="px-5 py-3 md:px-8">
                    <div className="flex justify-end gap-2">
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
                        aria-label="삭제"
                      >
                        <Trash2 size={13} /> {confirm === d.id ? "한 번 더 눌러 삭제" : ""}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="w-full min-w-[680px] text-left text-[14px]">
            <thead className="sticky top-0 bg-white text-xs text-sub">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium md:px-8">일시</th>
                <th className="px-3 py-2.5 font-medium">주제</th>
                <th className="px-3 py-2.5 font-medium">유형</th>
                <th className="px-3 py-2.5 font-medium">방식</th>
                <th className="px-3 py-2.5 font-medium">결과</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-bg2 align-top">
                  <td className="whitespace-nowrap px-5 py-3 text-sub md:px-8">{formatTime(h.at)}</td>
                  <td className="max-w-[360px] px-3 py-3">{h.topic}</td>
                  <td className="px-3 py-3 text-sub">{h.contentType}</td>
                  <td className="px-3 py-3 text-sub">{h.mock ? "샘플" : "AI 생성"}</td>
                  <td className="px-3 py-3">
                    {h.outcome === "success" ? (
                      h.docId && hasDoc(h.docId) ? (
                        <button className="underline underline-offset-2" onClick={() => onOpen(h.docId!)}>완료 · 열기</button>
                      ) : (
                        <span className="text-sub">완료 (삭제됨)</span>
                      )
                    ) : (
                      <span className="text-err">실패{h.message ? ` · ${h.message}` : ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
