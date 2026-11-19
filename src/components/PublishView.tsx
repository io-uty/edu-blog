"use client";

import { useState } from "react";
import { ArrowLeft, Check, Copy, Dot, Download, ExternalLink, Loader2 } from "lucide-react";
import { HUMAN_REVIEW_NOTICE, buildChecks } from "@/lib/checks";
import { renderHashtags } from "@/lib/render";
import type { Settings } from "@/lib/settings";
import { formatTime, imagePosition, sortImages, type DocRecord, type ImageItem, type Quality } from "@/lib/store";
import { buildZip, imageFileName, saveBlob } from "./exporter";
import { renderBlob, useRendered } from "./useRendered";
import { PageHeader, StepBar } from "./ui";

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";

// 네이버 공식 게시 연동이 없으므로 자동 게시·화면 조작 없이, 사용자가 순서대로 옮기도록 안내한다.

function Thumb({ item, settings, items }: { item: ImageItem; settings: Settings; items: ImageItem[] }) {
  const url = useRendered(item, settings.image);
  return (
    <li className="text-xs">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="aspect-square w-full rounded-xl border border-line" />
      ) : (
        <div className="aspect-square w-full bg-bg2" />
      )}
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate text-sub" title={imagePosition(item)}>
          {imageFileName(items, item).replace(".png", "")}
        </span>
        <button
          className="shrink-0 text-sub hover:text-ink"
          title="다운로드"
          onClick={async () => saveBlob(await renderBlob(item, settings.image), imageFileName(items, item))}
        >
          <Download size={14} />
        </button>
      </div>
    </li>
  );
}

function Step({
  n,
  done,
  title,
  desc,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  desc?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 border-b border-line px-5 py-4 last:border-0">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
          done ? "bg-ok text-white" : "border border-line bg-white text-ink"
        }`}
      >
        {done ? <Check size={15} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {desc && <p className="mt-0.5 text-[13px] leading-5 text-sub">{desc}</p>}
        {children && <div className="mt-2.5 space-y-2">{children}</div>}
      </div>
    </li>
  );
}

export default function PublishView({
  doc,
  settings,
  quality,
  html,
  plainText,
  onBack,
  onConfirmPublished,
  notify,
  track = () => undefined,
}: {
  doc: DocRecord;
  settings: Settings;
  quality: Quality;
  html: string;
  plainText: string;
  onBack: () => void;
  onConfirmPublished: (published: boolean) => void;
  notify: (m: string) => void;
  track?: (type: string, kind?: string) => void;
}) {
  const tags = renderHashtags(doc.draft.hashtags);
  const checks = buildChecks(quality);
  const images = sortImages(doc.images);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const mark = (k: string) => setDone((d) => ({ ...d, [k]: true }));
  const [zipping, setZipping] = useState<"" | "images" | "all">("");
  const published = doc.status === "published_confirmed";

  async function copyBody(): Promise<boolean> {
    try {
      // 서식(정렬·글자 크기·소제목 스타일)을 유지한 채 네이버 에디터에 붙여넣기
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      try {
        await navigator.clipboard.writeText(plainText);
        return true;
      } catch {
        return false;
      }
    }
  }

  async function copyText(text: string, label: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label}을(를) 복사했습니다. 네이버 글쓰기 화면에 붙여넣으세요(⌘V)`);
      mark(key);
      track("content_copied", key);
    } catch {
      notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  async function zip(kind: "images" | "all") {
    setZipping(kind);
    try {
      const { blob, name } = await buildZip(doc, settings, kind === "all" ? { plainText, html, tags } : null);
      saveBlob(blob, name);
      if (kind === "images") mark("images");
      track(kind === "images" ? "image_downloaded" : "package_downloaded", kind === "images" ? "all" : "package");
    } catch {
      notify("파일을 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setZipping("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="네이버 블로그에 올리기"
        sub={doc.topic}
        actions={
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={15} /> 편집으로 돌아가기
          </button>
        }
      />
      <StepBar current={2} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-5 py-8 md:px-10">
            <p className="label">블로그 제목</p>
            <h2 className="mb-8 border-b border-line pb-6 text-[24px] font-semibold leading-snug">{doc.draft.title}</h2>
            <p className="label">본문 미리보기 · 네이버에 붙여넣으면 이렇게 보입니다</p>
            <div className="blog-preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        <aside className="w-full shrink-0 border-t border-line lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="border-b border-line px-5 py-4">
            <p className="text-[15px] font-semibold">이 순서대로 옮기세요</p>
            <p className="mt-0.5 text-[13px] text-sub">버튼을 누른 단계에는 완료 표시가 붙습니다.</p>
          </div>
          <ol>
            <Step n={1} done={!!done.open} title="네이버 글쓰기 화면 열기" desc="새 탭에서 네이버 블로그 글쓰기가 열립니다. 로그인이 필요할 수 있어요.">
              <a
                className="btn btn-primary w-full"
                href={NAVER_WRITE_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  mark("open");
                  track("naver_write_opened");
                }}
              >
                <ExternalLink size={15} /> 네이버 글쓰기 열기
              </a>
            </Step>
            <Step n={2} done={!!done.title} title="제목 넣기" desc="복사한 뒤 네이버 글쓰기의 제목 칸에 붙여넣으세요.">
              <button className="btn w-full" onClick={() => copyText(doc.draft.title, "제목", "title")}>
                <Copy size={15} /> 제목 복사
              </button>
            </Step>
            <Step n={3} done={!!done.body} title="본문 넣기" desc="본문 칸을 한 번 클릭하고 붙여넣으세요. 글자 크기·정렬 같은 서식도 함께 들어갑니다.">
              <button
                className="btn w-full"
                onClick={async () => {
                  if (await copyBody()) {
                    notify("본문을 복사했습니다. 네이버 본문 칸에 붙여넣으세요(⌘V)");
                    mark("body");
                    track("content_copied", "body");
                  } else notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
                }}
              >
                <Copy size={15} /> 본문 복사 (서식 포함)
              </button>
            </Step>
            {images.length > 0 && (
              <Step
                n={4}
                done={!!done.images}
                title={`이미지 ${images.length}장 넣기`}
                desc={
                  <>
                    본문의 <b>[이미지 1 · 썸네일]</b> 같은 표시 자리에 같은 번호의 이미지를 올리고, 표시 문구는 지워 주세요.
                  </>
                }
              >
                <ul className="grid grid-cols-3 gap-2">
                  {images.map((it) => (
                    <Thumb key={it.id} item={it} settings={settings} items={images} />
                  ))}
                </ul>
                <button className="btn w-full" disabled={!!zipping} onClick={() => zip("images")}>
                  {zipping === "images" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} 이미지 한 번에 받기 (.zip)
                </button>
              </Step>
            )}
            <Step
              n={images.length > 0 ? 5 : 4}
              done={!!done.tags}
              title="해시태그 확인"
              desc="해시태그는 본문 맨 끝에 이미 들어 있습니다. 네이버 태그 칸에 따로 넣으려면 복사하세요."
            >
              <p className="text-[13px] leading-6">{tags}</p>
              <button className="btn btn-sm" onClick={() => copyText(tags, "태그", "tags")}>
                <Copy size={14} /> 태그 복사
              </button>
            </Step>
            <Step
              n={images.length > 0 ? 6 : 5}
              done={published}
              title="최종 확인 후 발행"
              desc={
                <>
                  네이버에서 임시저장 → 최종 확인 → 발행하세요.
                  {settings.brand.placeName ? ` 에디터 상단 '장소'에서 "${settings.brand.placeName}"을 추가할 수 있습니다.` : ""}
                </>
              }
            >
              {published ? (
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-ok">발행 완료로 표시함{doc.publishedAt ? ` · ${formatTime(doc.publishedAt)}` : ""} (직접 확인)</span>
                  <button className="text-sub underline underline-offset-2" onClick={() => onConfirmPublished(false)}>
                    표시 취소
                  </button>
                </div>
              ) : (
                <button className="btn w-full" onClick={() => onConfirmPublished(true)}>
                  <Check size={15} /> 네이버에 발행했어요
                </button>
              )}
              <p className="text-xs text-sub">bbolog 는 네이버에 직접 게시하지 않습니다. 발행 여부는 직접 눌러 표시해 주세요.</p>
            </Step>
          </ol>

          <section className="border-t border-line bg-bg2 px-5 py-4">
            <p className="label">검토</p>
            <ul className="text-[14px]">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 py-1">
                  {c.ok ? <Check size={14} className="text-ok" /> : <Dot size={16} className="-mx-px" />}
                  <span className="flex-1">{c.label}</span>
                  <span className={c.ok ? "text-sub" : ""}>{c.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-sub">
              {doc.mock ? "샘플 데이터는 게시하지 마세요. " : ""}
              {HUMAN_REVIEW_NOTICE}
            </p>
            <button className="btn btn-sm mt-3 w-full" disabled={!!zipping} onClick={() => zip("all")}>
              {zipping === "all" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 글·이미지 전체 백업 (.zip)
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
