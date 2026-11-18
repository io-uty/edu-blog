"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { BANNED_PHRASES, BRAND, HASHTAG_COUNT, LENGTH_TARGET, SECTION_RANGE } from "@/config/brand";
import { STATUS_LABEL, formatTime, type DocRecord, type HistoryEntry } from "@/lib/store";
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
          <table className="w-full min-w-[720px] text-left text-[13px]">
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
                  <td className={`px-3 py-3 ${d.quality.status === "FAILED" ? "text-err" : "text-warn"}`}>
                    {d.mock ? "샘플" : STATUS_LABEL[d.quality.status]}
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
          <table className="w-full min-w-[680px] text-left text-[13px]">
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

function Def({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-bg2 py-3 md:grid-cols-[160px_1fr] md:gap-6">
      <dt className="text-sub">{k}</dt>
      <dd className="min-w-0 break-words leading-6">{children}</dd>
    </div>
  );
}

export function BrandView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="브랜드 설정" sub="모든 글에 공통 적용되는 값입니다" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[860px] px-5 py-6 text-[13px] md:px-8">
          <p className="mb-2 text-xs leading-5 text-sub">
            이 값은 <code className="bg-bg2 px-1">src/config/brand.ts</code>에서 관리되며 AI가 생성하거나 변경하지 않습니다. 화면에서의 수정은 아직 지원되지 않습니다.
          </p>
          <dl>
            <Def k="학원명">{BRAND.name}</Def>
            <Def k="작성자">{BRAND.author}</Def>
            <Def k="인사말">{BRAND.greeting}</Def>
            <Def k="마무리 소제목">{BRAND.closingHeading}</Def>
            <Def k="네이버 예약 링크">{BRAND.bookingUrl}</Def>
            <Def k="장소 정보">
              {BRAND.place.name}
              <br />
              {BRAND.place.address} · {BRAND.place.phone}
            </Def>
            <Def k="제목 지역 표기">{BRAND.titleSuffixes.join("  ")}</Def>
            <Def k="고정 해시태그">{BRAND.fixedHashtags.map((t) => `#${t}`).join(" ")}</Def>
            <Def k="지역 해시태그">
              <ul className="space-y-1">
                {BRAND.regionHashtagGroups.map((g, i) => (
                  <li key={i} className="text-sub">{g.map((t) => `#${t}`).join(" ")}</li>
                ))}
              </ul>
            </Def>
            <Def k="작성 기준">
              본문 {LENGTH_TARGET.min.toLocaleString()}~{LENGTH_TARGET.max.toLocaleString()}자 · 소주제 {SECTION_RANGE.min}~{SECTION_RANGE.max}개 · 해시태그 {HASHTAG_COUNT}개
            </Def>
            <Def k="금지 표현">{BANNED_PHRASES.join(" · ")}</Def>
          </dl>
        </div>
      </div>
    </div>
  );
}
