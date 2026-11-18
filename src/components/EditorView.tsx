"use client";

import { useEffect, useState } from "react";
import { PanelRight, Send } from "lucide-react";
import { jumpTo } from "@/lib/locate";
import type { Draft } from "@/lib/schemas";
import type { Settings } from "@/lib/settings";
import type { TenantProfile } from "@/lib/tenant";
import type { DocRecord, Quality } from "@/lib/store";
import DocEditor from "./DocEditor";
import { ImageGallery, ImageLightbox, imageNumber, type ImageActions } from "./images";
import ReviewPanel from "./ReviewPanel";
import { PageHeader } from "./ui";

export type SaveState = { state: "idle" | "saving" | "saved" | "error"; at?: number };

export function SaveLabel({ save }: { save: SaveState }) {
  if (save.state === "saving") return <>저장 중…</>;
  if (save.state === "error") return <span className="text-err">저장 실패 · 연결을 확인하세요(다음 수정 때 다시 저장)</span>;
  if (save.state === "saved" && save.at) {
    const d = new Date(save.at);
    return <>자동 저장됨 {String(d.getHours()).padStart(2, "0")}:{String(d.getMinutes()).padStart(2, "0")}</>;
  }
  return <>자동 저장</>;
}

type Tab = "review" | "images";

export default function EditorView({
  doc,
  quality,
  settings,
  tenant,
  save,
  aiEnabled,
  imageActions,
  openImage,
  onCloseImage,
  onChange,
  onPublish,
}: {
  doc: DocRecord;
  quality: Quality;
  settings: Settings;
  tenant: TenantProfile | null;
  save: SaveState;
  aiEnabled: boolean;
  imageActions: ImageActions;
  openImage: string | null;
  onCloseImage: () => void;
  onChange: (d: Draft) => void;
  onPublish: () => void;
}) {
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState<Tab>("review");
  useEffect(() => setPanel(window.innerWidth >= 1280), []);

  const images = doc.images ?? [];
  const lightboxItem = openImage ? images.find((i) => i.id === openImage) : undefined;

  const outline = [
    { id: "blk-title", label: "제목" },
    { id: "blk-intro", label: "도입부" },
    ...doc.draft.sections.map((s, i) => ({ id: `blk-s${i}`, label: `${i + 1}. ${s.heading}` })),
    { id: "blk-concl", label: "마무리" },
    { id: "blk-tags", label: "태그" },
  ];

  const openTab = (t: Tab) => {
    if (panel && tab === t) setPanel(false);
    else {
      setTab(t);
      setPanel(true);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="블로그 글 편집"
        sub={doc.topic}
        status={<SaveLabel save={save} />}
        actions={
          <>
            <button className="btn" onClick={() => openTab("review")} aria-pressed={panel && tab === "review"}>
              <PanelRight size={16} /> 검수
            </button>
            <button className="btn" onClick={() => openTab("images")} aria-pressed={panel && tab === "images"}>
              이미지 {images.length}
            </button>
            <button className="btn btn-primary" onClick={onPublish}>
              <Send size={15} /> 발행 준비
            </button>
          </>
        }
      />
      {doc.mock && (
        <div className="border-b border-line bg-bg2 px-5 py-2 text-xs text-sub md:px-8">
          샘플 데이터입니다. 실제 생성물이 아니므로 게시하지 마세요.
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
          <DocEditor
            draft={doc.draft}
            onChange={onChange}
            aiEnabled={aiEnabled}
            settings={settings}
            tenant={tenant}
            images={images}
            imageActions={imageActions}
          />
          <p className="pb-10 text-center text-xs text-sub">
            {settings.brand.name}
            {settings.brand.author && settings.brand.author !== settings.brand.name ? ` · 작성자 ${settings.brand.author}` : ""}
          </p>
        </div>

        {panel && (
          <aside
            aria-label="보조 패널"
            className="fixed inset-y-0 right-0 z-30 flex w-[320px] flex-col border-l border-line bg-white shadow-lg xl:static xl:z-auto xl:shadow-none"
          >
            <div className="flex shrink-0 items-center border-b border-line">
              {(["review", "images"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`h-11 flex-1 border-b-2 text-[13px] ${tab === t ? "border-brand font-semibold" : "border-transparent text-sub"}`}
                >
                  {t === "review" ? "검수" : `이미지 ${images.length}`}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm mx-1 xl:hidden" onClick={() => setPanel(false)}>
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "review" ? (
                <ReviewPanel doc={doc} quality={quality} onJump={jumpTo} />
              ) : (
                <ImageGallery items={images} actions={imageActions} sectionCount={doc.draft.sections.length} />
              )}
            </div>
          </aside>
        )}
      </div>
      {lightboxItem && (
        <ImageLightbox item={lightboxItem} number={imageNumber(images, lightboxItem.id)} actions={imageActions} onClose={onCloseImage} />
      )}
    </div>
  );
}
