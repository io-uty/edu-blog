"use client";

import { useEffect, useState } from "react";
import { PanelRight, Send } from "lucide-react";
import { BRAND } from "@/config/brand";
import { jumpTo } from "@/lib/locate";
import type { Draft } from "@/lib/schemas";
import type { DocRecord } from "@/lib/store";
import DocEditor from "./DocEditor";
import ReviewPanel from "./ReviewPanel";
import { PageHeader } from "./ui";

export type SaveState = { state: "idle" | "saving" | "saved" | "error"; at?: number };

export function SaveLabel({ save }: { save: SaveState }) {
  if (save.state === "saving") return <>저장 중…</>;
  if (save.state === "error") return <span className="text-err">저장 실패 · 브라우저 저장공간을 확인하세요</span>;
  if (save.state === "saved" && save.at) {
    const d = new Date(save.at);
    return <>자동 저장됨 {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}</>;
  }
  return <>자동 저장</>;
}

export default function EditorView({
  doc,
  save,
  aiEnabled,
  onChange,
  onPublish,
}: {
  doc: DocRecord;
  save: SaveState;
  aiEnabled: boolean;
  onChange: (d: Draft) => void;
  onPublish: () => void;
}) {
  const [panel, setPanel] = useState(false);
  useEffect(() => setPanel(window.innerWidth >= 1280), []);

  const outline = [
    { id: "blk-title", label: "제목" },
    { id: "blk-intro", label: "도입부" },
    ...doc.draft.sections.map((s, i) => ({ id: `blk-s${i}`, label: `${i + 1}. ${s.heading}` })),
    { id: "blk-concl", label: "마무리" },
    { id: "blk-tags", label: "태그" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="블로그 글 편집"
        sub={doc.topic}
        status={<SaveLabel save={save} />}
        actions={
          <>
            <button className="btn" onClick={() => setPanel((p) => !p)} aria-pressed={panel} title="검수 패널 열기/닫기">
              <PanelRight size={16} /> 검수
            </button>
            <button className="btn btn-primary" onClick={onPublish}>
              <Send size={15} /> 발행 준비
            </button>
          </>
        }
      />
      {doc.mock && (
        <div className="border-b border-line bg-bg2 px-5 py-2 text-xs text-warn md:px-8">
          샘플 데이터입니다. 실제 생성물이 아니므로 게시하지 마세요. API 키를 설정하면 실제 글이 생성됩니다.
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="문서 목차" className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-line px-3 py-5 lg:block">
          <p className="label px-2">구성</p>
          <ul>
            {outline.map((o) => (
              <li key={o.id}>
                <button
                  className="block w-full truncate px-2 py-1.5 text-left text-[13px] text-sub hover:bg-bg2 hover:text-ink"
                  onClick={() => jumpTo(o.id)}
                  title={o.label}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto bg-white">
          <DocEditor draft={doc.draft} onChange={onChange} aiEnabled={aiEnabled} />
          <p className="pb-10 text-center text-xs text-sub">{BRAND.name} 공식 블로그 · 작성자 {BRAND.author}</p>
        </div>

        {panel && (
          <aside
            aria-label="검수 패널"
            className="fixed inset-y-0 right-0 z-30 w-[320px] overflow-y-auto border-l border-line bg-white shadow-lg xl:static xl:z-auto xl:shadow-none"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3 xl:hidden">
              <span className="font-semibold">검수</span>
              <button className="btn btn-sm" onClick={() => setPanel(false)}>닫기</button>
            </div>
            <ReviewPanel doc={doc} onJump={jumpTo} />
          </aside>
        )}
      </div>
    </div>
  );
}
