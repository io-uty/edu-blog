"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Dot, Download, ExternalLink, Loader2 } from "lucide-react";
import { HUMAN_REVIEW_NOTICE, buildChecks } from "@/lib/checks";
import { renderHashtags } from "@/lib/render";
import type { Settings } from "@/lib/settings";
import { imagePosition, sortImages, type DocRecord, type ImageItem, type Quality } from "@/lib/store";
import { buildZip, imageFileName, saveBlob } from "./exporter";
import { renderBlob, useRendered } from "./useRendered";
import { PageHeader } from "./ui";

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";

/** 확장 프로그램(extension/)이 설치되어 있으면 페이지에 표시를 남긴다 */
function useExtension() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const check = () => setOk(document.documentElement.dataset.bbologExtension === "1");
    check();
    const onMsg = (e: MessageEvent) => e.source === window && e.data?.source === "bbolog-extension" && check();
    window.addEventListener("message", onMsg);
    const t = setTimeout(check, 800);
    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(t);
    };
  }, []);
  return ok;
}

function Thumb({ item, settings, items }: { item: ImageItem; settings: Settings; items: ImageItem[] }) {
  const url = useRendered(item, settings.image);
  return (
    <li className="text-xs">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="aspect-square w-full border border-line" />
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
          <Download size={13} />
        </button>
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
  notify,
}: {
  doc: DocRecord;
  settings: Settings;
  quality: Quality;
  html: string;
  plainText: string;
  onBack: () => void;
  notify: (m: string) => void;
}) {
  const tags = renderHashtags(doc.draft.hashtags);
  const checks = buildChecks(quality);
  const images = sortImages(doc.images);
  const hasExt = useExtension();
  const [zipping, setZipping] = useState<"" | "images" | "all">("");

  async function writeBody(): Promise<boolean> {
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

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label}을(를) 복사했습니다`);
    } catch {
      notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  function openNaver() {
    // 클립보드 쓰기는 클릭 직후에 시작해야 허용된다
    const copied = writeBody();
    if (hasExt) {
      window.postMessage(
        { source: "bbolog-app", type: "handoff", payload: { title: doc.draft.title, html, plainText, at: Date.now() } },
        window.location.origin,
      );
    }
    window.open(NAVER_WRITE_URL, "_blank", "noopener");
    copied.then((ok) =>
      notify(
        hasExt
          ? "글쓰기 화면이 열리면 제목과 본문이 자동으로 들어갑니다"
          : ok
            ? "본문을 복사했습니다. 글쓰기 화면 본문을 클릭하고 붙여넣기(⌘V) 하세요"
            : "복사하지 못했습니다. 본문 복사 버튼을 눌러 주세요",
      ),
    );
  }

  async function zip(kind: "images" | "all") {
    setZipping(kind);
    try {
      const { blob, name } = await buildZip(doc, settings, kind === "all" ? { plainText, html, tags } : null);
      saveBlob(blob, name);
    } catch {
      notify("파일을 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setZipping("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="발행 준비"
        sub={doc.topic}
        actions={
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={15} /> 편집으로 돌아가기
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-5 py-8 md:px-10">
            <p className="label">블로그 제목</p>
            <h2 className="mb-8 border-b border-line pb-6 text-[24px] font-semibold leading-snug">{doc.draft.title}</h2>
            <p className="label">본문 미리보기 · 블로그 설정의 서식 적용</p>
            <div className="blog-preview" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        <aside className="w-full shrink-0 border-t border-line lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <section className="border-b border-line px-5 py-4">
            <p className="label">검수</p>
            <ul className="text-[13px]">
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
          </section>

          {images.length > 0 && (
            <section className="border-b border-line px-5 py-4">
              <p className="label">이미지 {images.length}장 · 본문의 [이미지 n] 자리에 넣으세요</p>
              <ul className="grid grid-cols-3 gap-2">
                {images.map((it) => (
                  <Thumb key={it.id} item={it} settings={settings} items={images} />
                ))}
              </ul>
              <button className="btn btn-sm mt-3 w-full" disabled={!!zipping} onClick={() => zip("images")}>
                {zipping === "images" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 이미지 전체 다운로드
              </button>
            </section>
          )}

          <section className="border-b border-line px-5 py-4">
            <p className="label">해시태그 ({doc.draft.hashtags.length})</p>
            <p className="text-[13px] leading-6">{tags}</p>
          </section>

          <section className="space-y-2 px-5 py-4">
            <p className="label">네이버 블로그로 옮기기</p>
            <button className="btn btn-primary w-full" onClick={openNaver}>
              <ExternalLink size={15} /> 네이버 글쓰기 열고 붙여넣기
            </button>
            <p className="text-xs leading-5 text-sub">
              {hasExt
                ? "bbolog 확장 프로그램이 연결되어 있어 제목과 본문이 자동으로 들어갑니다."
                : "본문이 자동 복사됩니다. 확장 프로그램을 설치하면 붙여넣기까지 자동으로 됩니다."}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                className="btn px-2"
                onClick={async () => notify((await writeBody()) ? "본문을 복사했습니다 (서식 포함)" : "복사하지 못했습니다")}
              >
                <Copy size={14} /> 본문
              </button>
              <button className="btn px-2" onClick={() => copyText(doc.draft.title, "제목")}>
                <Copy size={14} /> 제목
              </button>
              <button className="btn px-2" onClick={() => copyText(tags, "태그")}>
                <Copy size={14} /> 태그
              </button>
            </div>
            <button className="btn w-full" disabled={!!zipping} onClick={() => zip("all")}>
              {zipping === "all" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} 전체 패키지 다운로드 (.zip)
            </button>
            <ol className="list-decimal space-y-1 pl-5 pt-3 text-xs leading-5 text-sub">
              <li>제목·본문을 넣은 뒤 [이미지 n] 표시 자리에 이미지를 올리고 표시 문구는 지웁니다.</li>
              {settings.brand.bookingUrl && <li>맨 끝 예약 링크는 에디터에서 링크 카드로 바뀝니다.</li>}
              {settings.brand.placeName && <li>에디터 상단 장소에서 “{settings.brand.placeName}”을 추가합니다.</li>}
              <li>임시저장 후 최종 검토하고 발행합니다.</li>
            </ol>
            <p className="pt-1 text-xs text-sub">
              이 화면은 발행 전 검수용이며 발행 완료를 의미하지 않습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
