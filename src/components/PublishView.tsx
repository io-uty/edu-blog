"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Download, ExternalLink, Loader2, Puzzle, Send } from "lucide-react";
import { renderHashtags } from "@/lib/render";
import type { Settings } from "@/lib/settings";
import { formatTime, imagePosition, sortImages, type DocRecord, type ImageItem } from "@/lib/store";
import { greetingSticker } from "@/lib/extras";
import { buildZip, imageFileName, renderFile, saveBlob } from "./exporter";
import { renderBlob, useRendered } from "./useRendered";
import { PageHeader, StepBar } from "./ui";
import { PixelMark } from "./Logo";

/** 본문에 넣는 이미지는 네이버 붙여넣기 용량 한도를 넘지 않게 720px JPEG 로 줄인다(장당 수십 KB). */
async function shrinkForPaste(b: Blob): Promise<string> {
  const bmp = await createImageBitmap(b);
  const sc = Math.min(1, 720 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * sc);
  c.height = Math.round(bmp.height * sc);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";
/** 크롬 웹스토어 등록 후 받는 상세 페이지 주소. 비어 있으면 설치 안내를 숨긴다. */
const EXTENSION_URL = process.env.NEXT_PUBLIC_EXTENSION_URL ?? "";

/** 확장을 설치할 수 있는 데스크톱 크롬 계열(Chrome·Edge·Whale)인지. 모바일·Safari·Firefox 에는 설치 안내를 띄우지 않는다. */
const canInstallExtension = () =>
  typeof navigator !== "undefined" && /Chrome\//.test(navigator.userAgent) && !/Mobile|Android/.test(navigator.userAgent);

// 네이버 공식 게시 연동이 없다. 뚝딱 확장(extension/)이 있으면 글쓰기 화면에 대신 붙여넣고, 없으면 순서대로 옮기도록 안내한다.
// 발행 버튼은 누르지 않는다.

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
          {imageFileName(items, item).replace(/\.(png|gif)$/, "")}
        </span>
        <button
          className="shrink-0 text-sub hover:text-ink"
          title="다운로드"
          onClick={async () => saveBlob(await renderFile(items, item, settings.image), imageFileName(items, item))}
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
  html,
  plainText,
  onBack,
  onConfirmPublished,
  onDone,
  notify,
  track = () => undefined,
}: {
  doc: DocRecord;
  settings: Settings;
  html: string;
  plainText: string;
  onBack: () => void;
  onConfirmPublished: (published: boolean) => void;
  onDone: () => void;
  notify: (m: string) => void;
  track?: (type: string, kind?: string) => void;
}) {
  const tags = renderHashtags(doc.draft.hashtags);
  const images = sortImages(doc.images);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const mark = (k: string) => setDone((d) => ({ ...d, [k]: true }));
  const [zipping, setZipping] = useState<"" | "images" | "all">("");
  const published = doc.status === "published_confirmed";
  const [celebrate, setCelebrate] = useState(false);
  const [ask, setAsk] = useState(false);
  const asked = useRef(false);
  const [ext, setExt] = useState(false);
  const [sending, setSending] = useState(false);
  const [installable, setInstallable] = useState(false);

  // 확장의 app-bridge.js 가 <html data-bbolog-extension> 을 달고 ready 메시지를 보낸다
  useEffect(() => {
    if (document.documentElement.dataset.bbologExtension) setExt(true);
    setInstallable(!!EXTENSION_URL && canInstallExtension());
    const on = (e: MessageEvent) => {
      if (e.source === window && e.data?.source === "bbolog-extension" && e.data.type === "ready") setExt(true);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  // 네이버 발행 여부는 알 수 없으므로, 글쓰기 탭을 열고 본문까지 복사한 뒤 이 탭으로 돌아오면 한 번 물어본다.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible" && done.open && done.body && !published && !asked.current) {
        asked.current = true;
        setAsk(true);
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [done.open, done.body, published]);

  const finish = () => {
    setAsk(false);
    if (!published) onConfirmPublished(true);
    setCelebrate(true);
  };

  /** 이미지 표시 자리를 실제 이미지(dataURL)로 바꾼 본문 HTML. 렌더 실패한 이미지는 표시 문구를 남긴다. */
  async function htmlWithImages(): Promise<string> {
    // 맨 위 인사 스티커
    const sticker = await greetingSticker(doc.id, settings.image).then(shrinkForPaste).catch(() => null);
    let out = sticker ? `<p style="text-align:center;"><img src="${sticker}" alt="" style="max-width:260px;"></p>${html}` : html;
    for (const it of images) {
      const key = it.kind === "thumbnail" ? "thumb" : `s${it.sectionIndex}`;
      const src = await renderBlob(it, settings.image).then(shrinkForPaste).catch(() => null);
      if (src) out = out.replace(new RegExp(`<p data-slot="${key}"[^>]*>.*?</p>`), `<p style="text-align:center;"><img src="${src}" alt="" style="max-width:100%;"></p>`);
    }
    return out;
  }

  /** 확장으로 보내기: 이미지를 담은 본문을 확장에 넘겨 네이버 창을 오른쪽 절반에 열게 하고, 클립보드에도 복사해 둔다. 실패하면 새 탭으로 연다. */
  async function sendToNaver() {
    setSending(true);
    const body = htmlWithImages().catch(() => html);
    const copied = copyBody(true, body);
    const stored = new Promise<boolean>((resolve) => {
      const on = (e: MessageEvent) => {
        if (e.source !== window || e.data?.source !== "bbolog-extension" || !["stored", "failed"].includes(e.data.type)) return;
        window.removeEventListener("message", on);
        resolve(e.data.type === "stored");
      };
      window.addEventListener("message", on);
      setTimeout(() => (window.removeEventListener("message", on), resolve(false)), 5000);
    });
    window.postMessage(
      {
        source: "bbolog-app",
        type: "handoff",
        payload: { title: doc.draft.title, html: await body, plainText },
        // 확장이 이 창을 왼쪽 절반, 네이버 글쓰기 창을 오른쪽 절반에 놓는다
        screen: (({ availLeft = 0, availTop = 0, availWidth, availHeight }) => ({ left: availLeft, top: availTop, width: availWidth, height: availHeight }))(
          screen as Screen & { availLeft?: number; availTop?: number }, // 크롬 전용 속성(여러 모니터에서 현재 화면의 위치)
        ),
      },
      window.location.origin,
    );
    const ok = await stored;
    await copied;
    setSending(false);
    if (!ok) window.open(NAVER_WRITE_URL, "_blank", "noopener");
    ["open", "title", "body", "images"].forEach(mark);
    track("naver_sent", ok ? "extension" : "extension_failed");
    notify(
      ok
        ? "오른쪽 네이버 글쓰기 창에 제목·본문·이미지를 넣는 중입니다. 확인 후 발행해 주세요."
        : "확장에 전달하지 못했습니다. 본문은 복사되어 있으니 네이버 본문 칸에 붙여넣으세요(⌘V).",
    );
  }

  async function copyBody(withImages = true, prepared?: Promise<string>): Promise<boolean> {
    try {
      // 서식(정렬·글자 크기·소제목 스타일)과 이미지를 유지한 채 네이버 에디터에 붙여넣기.
      // Blob 을 Promise 로 넘겨야 Safari 에서도 클릭 직후의 복사 권한이 유지된다.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": (prepared ?? (withImages ? htmlWithImages() : Promise.resolve(html)))
            .catch(() => html)
            .then((h) => new Blob([h], { type: "text/html" })),
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

        <aside className="order-first w-full shrink-0 border-b border-line lg:order-none lg:w-[380px] lg:overflow-y-auto lg:border-b-0 lg:border-l">
          {ext ? (
            <div className="border-b border-line px-5 py-4">
              <button className="btn btn-primary h-12 w-full text-[15px]" disabled={sending} onClick={sendToNaver}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? "이미지 준비 중…" : "네이버로 한 번에 보내기"}
              </button>
              <p className="mt-2 text-[12px] leading-5 text-sub">
                화면 오른쪽에 네이버 글쓰기 창이 열리고 제목·본문·이미지가 자동으로 들어갑니다. 발행은 직접 눌러 주세요. 안 되면 아래 “직접 옮기려면”을 펼쳐 주세요.
              </p>
            </div>
          ) : (
            installable && (
              <div className="border-b border-line px-5 py-4">
                <div className="rounded-xl border border-[#f6d9c2] bg-brand-soft p-4">
                  <p className="text-[15px] font-semibold">복사·붙여넣기 없이 한 번에</p>
                  <p className="mt-1 text-[13px] leading-5 text-[#6b4a35]">
                    뚝딱 확장 프로그램을 추가하면 버튼 하나로 제목·본문·이미지가 네이버 글쓰기에 바로 들어갑니다.
                  </p>
                  <a
                    className="btn mt-3 w-full"
                    href={EXTENSION_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track("extension_install_clicked")}
                  >
                    <Puzzle size={15} /> Chrome에 추가
                  </a>
                  <p className="mt-2 text-center text-[12px] text-[#6b4a35]">무료 · 추가하고 이 탭으로 돌아오면 바로 켜집니다</p>
                </div>
              </div>
            )
          )}
          {ext ? (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between border-b border-line px-5 py-4 text-[15px] font-semibold hover:bg-bg2 [&::-webkit-details-marker]:hidden">
                직접 옮기려면
                <ChevronDown size={16} className="text-sub transition-transform group-open:rotate-180" />
              </summary>
            <ol>
              <Step n={1} done={!!done.open} title="네이버 글쓰기 화면 열기" desc="새 탭에서 네이버 블로그 글쓰기가 열립니다. 로그인이 필요할 수 있어요.">
                <a
                  className={`btn w-full ${ext ? "" : "btn-primary"}`}
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
              <Step n={3} done={!!done.body} title="본문 넣기" desc={`본문 칸을 한 번 클릭하고 붙여넣으세요. 글자 크기·정렬 같은 서식${images.length ? "과 이미지" : ""}도 함께 들어갑니다.`}>
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
                {images.length > 0 && (
                  <button
                    className="btn btn-sm w-full"
                    onClick={async () => {
                      if (await copyBody(false)) {
                        notify("이미지 없이 본문만 복사했습니다. 이미지는 아래 4단계에서 올려 주세요");
                        mark("body");
                      } else notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
                    }}
                  >
                    붙여넣기가 안 되면: 이미지 빼고 본문만 복사
                  </button>
                )}
              </Step>
              {images.length > 0 && (
                <Step
                  n={4}
                  done={!!done.images}
                  title={`이미지가 빠졌다면 직접 넣기`}
                  desc={
                    <>
                      붙여넣은 본문에 <b>[이미지 1 · 썸네일]</b> 같은 표시가 남아 있으면, 그 자리에 같은 번호의 이미지를 올리고 표시 문구는 지워 주세요.
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
                    {settings.brand.name ? ` 에디터 상단 '장소'에서 "${settings.brand.name}"을 추가할 수 있습니다.` : ""}
                  </>
                }
              >
                {published ? (
                  <>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-ok">발행 완료로 표시함{doc.publishedAt ? ` · ${formatTime(doc.publishedAt)}` : ""} (직접 확인)</span>
                      <button className="text-sub underline underline-offset-2" onClick={() => onConfirmPublished(false)}>
                        표시 취소
                      </button>
                    </div>
                    <button className="btn btn-primary w-full" onClick={onDone}>
                      완료하고 홈으로
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary w-full" onClick={finish}>
                    <Check size={15} /> 네이버에 발행했어요
                  </button>
                )}
                <p className="text-xs text-sub">뚝딱은 네이버에 직접 게시하지 않습니다. 발행 여부는 직접 눌러 표시해 주세요.</p>
              </Step>
            </ol>
            </details>
          ) : (
            <>
            <div className="border-b border-line px-5 py-4">
              <p className="text-[15px] font-semibold">이 순서대로 옮기세요</p>
              <p className="mt-0.5 text-[13px] text-sub">버튼을 누른 단계에는 완료 표시가 붙습니다.</p>
            </div>
            <ol>
              <Step n={1} done={!!done.open} title="네이버 글쓰기 화면 열기" desc="새 탭에서 네이버 블로그 글쓰기가 열립니다. 로그인이 필요할 수 있어요.">
                <a
                  className={`btn w-full ${ext ? "" : "btn-primary"}`}
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
              <Step n={3} done={!!done.body} title="본문 넣기" desc={`본문 칸을 한 번 클릭하고 붙여넣으세요. 글자 크기·정렬 같은 서식${images.length ? "과 이미지" : ""}도 함께 들어갑니다.`}>
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
                {images.length > 0 && (
                  <button
                    className="btn btn-sm w-full"
                    onClick={async () => {
                      if (await copyBody(false)) {
                        notify("이미지 없이 본문만 복사했습니다. 이미지는 아래 4단계에서 올려 주세요");
                        mark("body");
                      } else notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
                    }}
                  >
                    붙여넣기가 안 되면: 이미지 빼고 본문만 복사
                  </button>
                )}
              </Step>
              {images.length > 0 && (
                <Step
                  n={4}
                  done={!!done.images}
                  title={`이미지가 빠졌다면 직접 넣기`}
                  desc={
                    <>
                      붙여넣은 본문에 <b>[이미지 1 · 썸네일]</b> 같은 표시가 남아 있으면, 그 자리에 같은 번호의 이미지를 올리고 표시 문구는 지워 주세요.
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
                    {settings.brand.name ? ` 에디터 상단 '장소'에서 "${settings.brand.name}"을 추가할 수 있습니다.` : ""}
                  </>
                }
              >
                {published ? (
                  <>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-ok">발행 완료로 표시함{doc.publishedAt ? ` · ${formatTime(doc.publishedAt)}` : ""} (직접 확인)</span>
                      <button className="text-sub underline underline-offset-2" onClick={() => onConfirmPublished(false)}>
                        표시 취소
                      </button>
                    </div>
                    <button className="btn btn-primary w-full" onClick={onDone}>
                      완료하고 홈으로
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary w-full" onClick={finish}>
                    <Check size={15} /> 네이버에 발행했어요
                  </button>
                )}
                <p className="text-xs text-sub">뚝딱은 네이버에 직접 게시하지 않습니다. 발행 여부는 직접 눌러 표시해 주세요.</p>
              </Step>
            </ol>
            </>
          )}

          <section className="border-t border-line bg-bg2 px-5 py-4">
            <button className="btn btn-sm w-full" disabled={!!zipping} onClick={() => zip("all")}>
              {zipping === "all" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 글·이미지 전체 백업 (.zip)
            </button>
          </section>
        </aside>
      </div>

      {ask && !celebrate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ask-title">
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 text-center shadow-xl">
            <p id="ask-title" className="text-[18px] font-bold">네이버에 발행을 마치셨나요?</p>
            <p className="mt-1.5 text-[14px] text-sub">발행했다면 완료로 표시하고 홈으로 돌아갑니다.</p>
            <div className="mt-5 flex gap-2">
              <button className="btn h-11 flex-1" onClick={() => setAsk(false)}>
                아직이에요
              </button>
              <button className="btn btn-primary h-11 flex-1" onClick={finish} autoFocus>
                발행 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="publish-done" role="dialog" aria-modal="true" aria-labelledby="done-title">
          <div className="flex max-w-[520px] flex-col items-center">
            <PixelMark size={56} className="compose-mark" />
            <h2 id="done-title">발행 완료!</h2>
            <p className="mt-3 text-[15px] leading-7 text-sub">
              <b className="text-ink">{doc.draft.title}</b>
              <br />
              글을 발행 완료로 표시했습니다.
            </p>
            <button className="intro-cta mt-8" style={{ animation: "none" }} onClick={onDone} autoFocus>
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
