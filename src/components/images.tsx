"use client";

import { useEffect } from "react";
import { ChevronRight, Download, ImagePlus, Loader2, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import { itemsToText, targetKey, textToItems, type ImageCopy, type ImageTarget } from "@/lib/imageCopy";
import type { ImageDesign, ImageLayout } from "@/lib/settings";
import { imageLabel, imagePosition, sortImages, type ImageItem } from "@/lib/store";
import { useRendered } from "./useRendered";
import { autoLayout } from "@/lib/imageRender";

export const LAYOUT_LABEL: Record<ImageLayout, string> = {
  poster: "포스터형(사진)",
  bold: "강조 타이포형",
  headline: "헤드라인형",
  notice: "공지형",
  checklist: "체크리스트형",
  summary: "내용정리형",
  scene: "사진형",
};

export interface ImageActions {
  design: ImageDesign;
  busy: Record<string, boolean>;
  illustrationEnabled: boolean;
  aiEnabled: boolean;
  regenerate: (t: ImageTarget) => void;
  illustrate: (id: string) => void;
  update: (id: string, patch: Partial<ImageItem>) => void;
  remove: (id: string) => void;
  removeIllustration: (id: string) => void;
  download: (item: ImageItem) => void;
  open: (id: string) => void;
}

export const copyBusyKey = (t: ImageTarget) => `copy:${targetKey(t)}`;
const illBusyKey = (id: string) => `ill:${id}`;

export function imageNumber(items: ImageItem[], id: string) {
  return sortImages(items).findIndex((i) => i.id === id) + 1;
}

function Preview({ item, design, className = "" }: { item: ImageItem; design: ImageDesign; className?: string }) {
  const url = useRendered(item, design);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={item.copy.title.join(" ")} className={`block aspect-square w-full bg-bg2 ${className}`} />
  ) : (
    <div className={`flex aspect-square w-full items-center justify-center bg-bg2 ${className}`}>
      <span className="spinner" />
    </div>
  );
}

/** 본문 편집기 안에서 이미지가 들어갈 자리 */
export function ImageSlot({
  target,
  item,
  number,
  actions,
}: {
  target: ImageTarget;
  item?: ImageItem;
  number: number;
  actions: ImageActions;
}) {
  const busy = actions.busy[copyBusyKey(target)];
  if (!item) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-xs text-sub">
        <ImagePlus size={14} />
        <span className="flex-1">{target.kind === "thumbnail" ? "썸네일 이미지 없음" : "이 소주제 이미지 없음"}</span>
        <button className="btn btn-sm" disabled={busy} onClick={() => actions.regenerate(target)}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null} 이미지 만들기
        </button>
      </div>
    );
  }
  return (
    <figure className="my-5">
      <button
        className="relative block w-full max-w-[360px] overflow-hidden rounded-2xl border border-line text-left hover:border-sub"
        onClick={() => actions.open(item.id)}
        title="크게 보기 · 수정"
      >
        <Preview item={item} design={actions.design} />
        {(busy || actions.busy[illBusyKey(item.id)]) && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 size={20} className="animate-spin" />
          </span>
        )}
      </button>
      <figcaption className="mt-1.5 text-xs text-sub">
        이미지 {number} · {imageLabel(item)} · {imagePosition(item)}
      </figcaption>
    </figure>
  );
}

/** 우측 패널의 이미지 목록 */
export function ImageGallery({ items, actions, sectionCount }: { items: ImageItem[]; actions: ImageActions; sectionCount: number }) {
  const sorted = sortImages(items);
  const missing: ImageTarget[] = [
    ...(items.some((i) => i.kind === "thumbnail") ? [] : [{ kind: "thumbnail" as const, sectionIndex: null }]),
    ...Array.from({ length: sectionCount }, (_, i) => i)
      .filter((i) => !items.some((it) => it.kind === "section" && it.sectionIndex === i))
      .map((i) => ({ kind: "section" as const, sectionIndex: i })),
  ];
  return (
    <div className="text-[14px]">
      <ul>
        {sorted.map((it, idx) => {
          const busy = actions.busy[copyBusyKey(it)] || actions.busy[illBusyKey(it.id)];
          return (
            <li key={it.id} className="flex gap-3 border-b border-line px-5 py-3">
              <button className="relative w-[88px] shrink-0 overflow-hidden rounded-xl border border-line" onClick={() => actions.open(it.id)} title="크게 보기">
                <Preview item={it} design={actions.design} />
                {busy && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 size={16} className="animate-spin" />
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  이미지 {idx + 1} · {imageLabel(it)}
                </p>
                <p className="text-xs text-sub">{imagePosition(it)}</p>
                <p className="text-xs text-sub">
                  {LAYOUT_LABEL[it.layout ?? autoLayout(it.kind, it.sectionIndex, actions.design, it.copy)]} · {it.illustration === "ready" ? "일러스트 포함" : "일러스트 없음"}
                </p>
                <div className="mt-1.5 flex gap-1">
                  <IconBtn label="문구 다시 만들기" disabled={busy || !actions.aiEnabled} onClick={() => actions.regenerate(it)}>
                    <RefreshCw size={13} />
                  </IconBtn>
                  {actions.illustrationEnabled && (
                    <IconBtn label="일러스트 생성" disabled={busy} onClick={() => actions.illustrate(it.id)}>
                      <Wand2 size={13} />
                    </IconBtn>
                  )}
                  <IconBtn label="다운로드" onClick={() => actions.download(it)}>
                    <Download size={13} />
                  </IconBtn>
                  <IconBtn label="삭제" disabled={busy} onClick={() => actions.remove(it.id)}>
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 && (
        <div className="space-y-1 px-5 py-3">
          {missing.map((t) => (
            <button key={targetKey(t)} className="btn btn-sm w-full justify-start" disabled={actions.busy[copyBusyKey(t)]} onClick={() => actions.regenerate(t)}>
              {actions.busy[copyBusyKey(t)] ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {t.kind === "thumbnail" ? "썸네일" : `소주제 ${t.sectionIndex! + 1}`} 이미지 만들기
            </button>
          ))}
        </div>
      )}
      {!sorted.length && !missing.length && <p className="px-5 py-6 text-sub">이미지가 없습니다.</p>}
    </div>
  );
}

function IconBtn({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="btn btn-sm px-2" title={label} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

/** 크게 보기 + 문구·레이아웃 수정 */
export function ImageLightbox({
  item,
  number,
  actions,
  onClose,
}: {
  item: ImageItem;
  number: number;
  actions: ImageActions;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const busy = actions.busy[copyBusyKey(item)] || actions.busy[illBusyKey(item.id)];
  const setCopy = (patch: Partial<ImageCopy>) => actions.update(item.id, { copy: { ...item.copy, ...patch } });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="이미지 보기" className="flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-3xl bg-white md:flex-row">
        <div className="relative shrink-0 bg-bg2 md:w-[58%]">
          <Preview item={item} design={actions.design} />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/50">
              <Loader2 size={24} className="animate-spin" />
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div>
              <p className="font-semibold">
                이미지 {number} · {imageLabel(item)}
              </p>
              <p className="text-xs text-sub">{imagePosition(item)} · 1080×1080</p>
            </div>
            <button className="btn btn-sm px-2" onClick={onClose} aria-label="닫기">
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-[14px]">
            <div>
              <label className="label">레이아웃</label>
              <select
                className="field h-9 py-0"
                value={item.layout ?? autoLayout(item.kind, item.sectionIndex, actions.design, item.copy)}
                onChange={(e) => actions.update(item.id, { layout: e.target.value as ImageLayout })}
              >
                {Object.entries(LAYOUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">상단 배지</label>
              <input className="field" value={item.copy.eyebrow} onChange={(e) => setCopy({ eyebrow: e.target.value })} />
            </div>
            <div>
              <label className="label">제목 (한 줄에 하나, 최대 3줄)</label>
              <textarea
                className="field resize-none"
                rows={3}
                value={item.copy.title.join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n").slice(0, 3);
                  setCopy({ title: lines.length ? lines : [""] });
                }}
              />
            </div>
            <div>
              <label className="label">강조할 제목 줄</label>
              <select className="field h-9 py-0" value={item.copy.highlight} onChange={(e) => setCopy({ highlight: Number(e.target.value) })}>
                <option value={-1}>없음</option>
                {item.copy.title.map((t, i) => (
                  <option key={i} value={i}>{i + 1}번째 줄 · {t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">한 줄 요약</label>
              <input className="field" value={item.copy.sub} onChange={(e) => setCopy({ sub: e.target.value })} />
            </div>
            <div>
              <label className="label">내용 정리 (한 줄에 하나, “항목: 설명” 형식, 최대 4줄)</label>
              <textarea
                className="field resize-none"
                rows={4}
                placeholder={"예) 시간 배분: 지문마다 2분씩 정해 두기"}
                value={itemsToText(item.copy.items)}
                onChange={(e) => setCopy({ items: textToItems(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">체크 항목 (한 줄에 하나)</label>
              <textarea
                className="field resize-none"
                rows={3}
                value={item.copy.points.join("\n")}
                onChange={(e) => setCopy({ points: e.target.value.split("\n").slice(0, 4) })}
              />
            </div>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-sub hover:text-ink">
                <ChevronRight size={13} className="transition-transform group-open:rotate-90" /> 일러스트 설명(프롬프트)
              </summary>
              <textarea className="field mt-2 resize-none text-xs" rows={3} value={item.copy.scene} onChange={(e) => setCopy({ scene: e.target.value })} />
              {!actions.illustrationEnabled && (
                <p className="mt-1 text-xs text-sub">일러스트 생성은 서버에 이미지 API 키(OPENAI_API_KEY)를 설정하면 사용할 수 있습니다.</p>
              )}
            </details>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            <button className="btn" disabled={busy || !actions.aiEnabled} onClick={() => actions.regenerate(item)}>
              <RefreshCw size={14} /> 문구 다시 만들기
            </button>
            {actions.illustrationEnabled && (
              <button className="btn" disabled={busy} onClick={() => actions.illustrate(item.id)}>
                <Wand2 size={14} /> {item.illustration === "ready" ? "일러스트 다시" : "일러스트 생성"}
              </button>
            )}
            {item.illustration === "ready" && (
              <button className="btn" disabled={busy} onClick={() => actions.removeIllustration(item.id)}>
                일러스트 빼기
              </button>
            )}
            <button className="btn" onClick={() => actions.download(item)}>
              <Download size={14} /> 다운로드
            </button>
            <button
              className="btn btn-ghost ml-auto"
              disabled={busy}
              onClick={() => {
                actions.remove(item.id);
                onClose();
              }}
            >
              <Trash2 size={14} /> 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
