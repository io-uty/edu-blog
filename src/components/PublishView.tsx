"use client";

import { ArrowLeft, Check, Copy, Download, ExternalLink, Minus, TriangleAlert } from "lucide-react";
import { BRAND } from "@/config/brand";
import { buildChecks } from "@/lib/checks";
import { renderHashtags } from "@/lib/render";
import { STATUS_LABEL, type DocRecord } from "@/lib/store";
import { PageHeader } from "./ui";

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";

export default function PublishView({
  doc,
  onBack,
  notify,
}: {
  doc: DocRecord;
  onBack: () => void;
  notify: (m: string) => void;
}) {
  const tags = renderHashtags(doc.draft.hashtags);
  const checks = buildChecks(doc.quality);
  const problems = doc.quality.issues.filter((i) => i.severity !== "info").length;
  const blocked = doc.quality.status === "FAILED" || doc.mock;

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label}을(를) 복사했습니다`);
    } catch {
      notify("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
  }

  async function copyBody() {
    try {
      // 서식(소제목 굵게, 표)을 유지한 채 네이버 에디터에 붙여넣기
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([doc.html], { type: "text/html" }),
          "text/plain": new Blob([doc.plainText], { type: "text/plain" }),
        }),
      ]);
      notify("본문을 복사했습니다 (서식 포함)");
    } catch {
      await copyText(doc.plainText, "본문");
    }
  }

  function downloadPackage() {
    const content = [
      `[제목]\n${doc.draft.title}`,
      `[태그]\n${tags}`,
      `[검수 상태]\n${STATUS_LABEL[doc.quality.status]}${doc.mock ? " (샘플 데이터)" : ""}`,
      `[본문]\n${doc.plainText}`,
    ].join("\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    a.download = `${doc.draft.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 40) || "블로그글"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
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
            <p className="label">본문 미리보기</p>
            <div className="blog-preview" dangerouslySetInnerHTML={{ __html: doc.html }} />
          </div>
        </div>

        <aside className="w-full shrink-0 border-t border-line lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <section className="border-b border-line px-5 py-4">
            <p className="label">최종 준비 상태</p>
            <p className={`text-[15px] font-semibold ${blocked ? "text-err" : "text-warn"}`}>
              {doc.mock ? "샘플 데이터 · 발행 불가" : STATUS_LABEL[doc.quality.status]}
            </p>
            <p className="mt-1 text-xs leading-5 text-sub">
              이 화면은 발행 전 검수용이며 발행 완료를 의미하지 않습니다. 발행은 네이버 블로그에서 직접 진행합니다.
            </p>
            <ul className="mt-3 text-[13px]">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 py-1">
                  {c.tone === "ok" ? <Check size={14} className="text-ok" /> : c.tone === "muted" ? <Minus size={14} className="text-sub" /> : <TriangleAlert size={14} className={c.tone === "err" ? "text-err" : "text-warn"} />}
                  <span className="flex-1">{c.label}</span>
                  <span className={c.tone === "err" ? "font-semibold text-err" : c.tone === "warn" ? "text-warn" : "text-sub"}>{c.value}</span>
                </li>
              ))}
            </ul>
            {problems > 0 && (
              <button className="btn btn-sm mt-2" onClick={onBack}>
                편집에서 확인하기
              </button>
            )}
          </section>

          <section className="border-b border-line px-5 py-4">
            <p className="label">해시태그 ({doc.draft.hashtags.length})</p>
            <p className="text-[13px] leading-6">{tags}</p>
          </section>

          <section className="space-y-2 px-5 py-4">
            <p className="label">복사 · 내보내기</p>
            <button className="btn btn-primary w-full" onClick={copyBody}>
              <Copy size={15} /> 본문 복사
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={() => copyText(doc.draft.title, "제목")}>
                <Copy size={15} /> 제목 복사
              </button>
              <button className="btn" onClick={() => copyText(tags, "태그")}>
                <Copy size={15} /> 태그 복사
              </button>
            </div>
            <button className="btn w-full" onClick={downloadPackage}>
              <Download size={15} /> 전체 패키지 다운로드 (.txt)
            </button>
            <a className="btn w-full" href={NAVER_WRITE_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> 네이버 블로그 글쓰기 열기
            </a>
            <ol className="list-decimal space-y-1 pl-5 pt-3 text-xs leading-5 text-sub">
              <li>글쓰기를 열고 제목을 붙여넣습니다.</li>
              <li>본문을 붙여넣습니다. 맨 끝 예약 링크는 예약 카드로 바뀝니다.</li>
              <li>에디터 상단 장소에서 “{BRAND.place.name}”을 추가합니다.</li>
              <li>임시저장 후 최종 검토하고 발행합니다.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
