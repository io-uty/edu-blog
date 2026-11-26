"use client";

import { useMemo, useState } from "react";
import { shrinkImage } from "@/lib/imageRender";
import { DEFAULT_SETTINGS, ILLUSTRATION_STYLES, NAME_TOKEN, resolveBrand, NAVER_FONT_SIZES, type IllustrationStyle, type Brand, type FormatTemplate, type ImageDesign, type ImageLayout, type Settings } from "@/lib/settings";
import type { ImageItem } from "@/lib/store";
import { displayName, type TenantProfile } from "@/lib/tenant";
import { LAYOUT_CHOICES, LAYOUT_LABEL } from "./images";
import { useRendered } from "./useRendered";
import { PageHeader } from "./ui";

const tagsToText = (t: string[]) => t.map((x) => `#${x}`).join(" ");
const textToTags = (v: string) =>
  v
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);

/** 입력 중에는 원문을 유지하고, 값은 파싱해서 저장하는 텍스트 입력 */
function ParsedInput<T>({
  value,
  format,
  parse,
  onChange,
  multiline,
  rows = 3,
}: {
  value: T;
  format: (v: T) => string;
  parse: (s: string) => T;
  onChange: (v: T) => void;
  multiline?: boolean;
  rows?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? format(value);
  const props = {
    className: `field ${multiline ? "resize-none" : ""}`,
    value: shown,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange(parse(e.target.value));
    },
    onBlur: () => setText(null),
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input {...props} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 md:grid-cols-[180px_1fr] md:gap-6">
      <div>
        <p className="pt-2 text-[14px]">{label}</p>
        {hint && <p className="text-xs leading-5 text-sub">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** 실제 글에 들어갈 모습 미리보기. {학원명}은 학원 이름이 바뀌면 따라 바뀐다. */
function NamePreview({ text, hasToken, onInsert }: { text: string; hasToken: boolean; onInsert: () => void }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-sub">
      <span>
        글에는 이렇게 들어갑니다: <span className="text-ink">{text || "(비어 있음)"}</span>
      </span>
      {!hasToken && (
        <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={onInsert}>
          학원 이름 자동으로 넣기
        </button>
      )}
    </p>
  );
}

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-line py-6">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-xs leading-5 text-sub">{desc}</p>}
      <div className="mt-2 divide-y divide-bg2">{children}</div>
    </section>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer border border-line bg-white p-0.5" />
      <input className="field h-9 w-[110px] font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

const SAMPLE: ImageItem = {
  id: "settings-sample",
  kind: "thumbnail",
  sectionIndex: null,
  copy: {
    eyebrow: "미리보기",
    title: ["핵심 개념", "한 번에 정리"],
    highlight: 1,
    sub: "헷갈리는 부분부터 확인",
    points: ["개념 정리", "예제 확인", "오답 기록"],
    visual: "card",
    items: [
      { label: "개념 정리", detail: "핵심 정의를 한 줄로 쓰기" },
      { label: "예제 확인", detail: "대표 유형 2개 먼저 풀기" },
      { label: "오답 기록", detail: "틀린 이유를 바로 적어 두기" },
    ],
    scene: "",
  },
  illustration: "none",
  updatedAt: 0,
};

function DesignPreview({ design, layout }: { design: ImageDesign; layout: ImageLayout }) {
  const item = useMemo(() => ({ ...SAMPLE, layout }), [layout]);
  const url = useRendered(item, design);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${LAYOUT_LABEL[layout]} 미리보기`} className="aspect-square w-full rounded-2xl border border-line" />
  ) : (
    <div className="aspect-square w-full bg-bg2" />
  );
}

export default function SettingsView({
  settings,
  onChange,
  notify,
  tenant,
  onEditTenant,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  notify: (m: string) => void;
  tenant: TenantProfile | null;
  onEditTenant: () => void;
}) {
  const { brand: b, format: f, image: im } = settings;
  const academy = tenant ? displayName(tenant) : "";
  const setBrand = (p: Partial<Brand>) => onChange({ ...settings, brand: { ...b, ...p } });
  const setFormat = (p: Partial<FormatTemplate>) => onChange({ ...settings, format: { ...f, ...p } });
  const setImage = (p: Partial<ImageDesign>) => onChange({ ...settings, image: { ...im, ...p } });

  const bodyPx = f.bodySize;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="블로그 설정"
        sub="모든 글에 공통으로 적용됩니다 · 변경 즉시 저장"
        actions={
          <button
            className="btn"
            onClick={() => {
              onChange({ ...settings, format: DEFAULT_SETTINGS.format, image: { ...DEFAULT_SETTINGS.image, label: im.label, logo: im.logo } });
              notify("서식·이미지 디자인을 기본값으로 되돌렸습니다");
            }}
          >
            서식 기본값으로
          </button>
        }
      />
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-5 py-2 md:px-8" aria-label="설정 항목">
        {[
          ["set-academy", "학원 정보"],
          ["set-format", "글 서식"],
          ["set-image", "이미지 디자인"],
          ["set-brand", "인사말·예약 링크"],
          ["set-tags", "제목·해시태그"],
        ].map(([id, label]) => (
          <button
            key={id}
            className="btn btn-sm btn-ghost whitespace-nowrap text-ink"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[900px] px-5 pb-16 text-[14px] md:px-8">
          <Section id="set-academy" title="학원 정보" desc="AI가 글을 쓸 때 쓰는 학원 유형·브랜드·문체입니다. 등록한 값만 쓰이고, 다른 학원과 섞이지 않습니다.">
            <Field label="학원">
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <span className="font-medium">{tenant ? displayName(tenant) : "미등록"}</span>
                {tenant && (
                  <span className="text-sub">
                    {tenant.academyType === "기타 교육기관" && tenant.academyTypeCustom ? tenant.academyTypeCustom : tenant.academyType}
                    {tenant.styleProfile ? " · 문체 분석 완료" : ""}
                    {tenant.sources.some((x) => x.type === "homepage") ? " · 홈페이지 정보 반영" : ""}
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm" onClick={onEditTenant}>학원 정보 수정</button>
              </div>
            </Field>
            {tenant && tenant.sources.length > 0 && (
              <Field label="정보 출처">
                <ul className="space-y-1 pt-1.5 text-xs text-sub">
                  {tenant.sources.map((x, i) => (
                    <li key={i} className="truncate" title={x.url}>
                      {x.type === "homepage" ? "홈페이지" : "기존 글"} · {x.url} · {new Date(x.checkedAt).toLocaleDateString("ko-KR")} 확인 · {x.fields.join(", ")}
                    </li>
                  ))}
                </ul>
              </Field>
            )}
          </Section>

          <Section id="set-format" title="글 서식" desc="본문 복사·자동 붙여넣기 때 네이버 에디터에 그대로 적용되는 서식입니다.">
            <Field label="전체 정렬">
              <div className="flex gap-1">
                {(
                  [
                    ["justify", "양쪽 정렬"],
                    ["left", "왼쪽 정렬"],
                    ["center", "가운데 정렬"],
                  ] as const
                ).map(([k, v]) => (
                  <button key={k} className={`btn btn-sm ${f.align === k ? "border-ink font-semibold" : ""}`} onClick={() => setFormat({ align: k })}>
                    {v}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="본문 글자 크기" hint="네이버 에디터 크기 단계">
              <select className="field h-9 w-[120px] py-0" value={f.bodySize} onChange={(e) => setFormat({ bodySize: Number(e.target.value) })}>
                {NAVER_FONT_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="소제목">
              <div className="flex flex-wrap items-center gap-3">
                <select className="field h-9 w-[120px] py-0" value={f.headingSize} onChange={(e) => setFormat({ headingSize: Number(e.target.value) })}>
                  {NAVER_FONT_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ColorInput value={f.headingColor} onChange={(v) => setFormat({ headingColor: v })} />
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.headingBold} onChange={(e) => setFormat({ headingBold: e.target.checked })} /> 굵게
                </label>
              </div>
            </Field>
            <Field label="소제목 앞 표시">
              <select className="field h-9 w-[200px] py-0" value={f.headingPrefix} onChange={(e) => setFormat({ headingPrefix: e.target.value as FormatTemplate["headingPrefix"] })}>
                <option value="number">번호 (1. 소제목)</option>
                <option value="dash">대시 (- 소제목)</option>
                <option value="none">없음</option>
              </select>
            </Field>
            <Field label="목록 기호" hint="체크리스트·항목을 나눌 때">
              <select className="field h-9 w-[200px] py-0" value={f.listMarker} onChange={(e) => setFormat({ listMarker: e.target.value })}>
                {["-", "·", "•", "✓", "▶"].map((m) => (
                  <option key={m} value={m}>{m} 항목</option>
                ))}
              </select>
            </Field>
            <Field label="기타">
              <div className="space-y-1.5 pt-2">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.blankLineBetween} onChange={(e) => setFormat({ blankLineBetween: e.target.checked })} /> 문단 사이 빈 줄 넣기
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.imageMarkers} onChange={(e) => setFormat({ imageMarkers: e.target.checked })} /> 이미지 들어갈 자리 표시 넣기 ([이미지 1 · 썸네일])
                </label>
              </div>
            </Field>
            <Field label="미리보기">
              <div className="rounded-2xl border border-line px-5 py-4" style={{ textAlign: f.align }}>
                <p style={{ fontSize: f.headingSize, color: f.headingColor, fontWeight: f.headingBold ? 700 : 400, lineHeight: 1.5 }}>
                  {f.headingPrefix === "number" ? "1. " : f.headingPrefix === "dash" ? "- " : ""}보기를 보기 전에 빈칸의 역할부터 정합니다
                </p>
                {f.blankLineBetween && <br />}
                <p style={{ fontSize: bodyPx, lineHeight: 1.8 }}>
                  빈칸이 글에서 어떤 기능을 하는지 먼저 정하면 풀기 쉬워집니다. 주장, 이유, 예시, 대조 중 무엇을 채우는 자리인지 정한 다음 보기를 보세요.
                </p>
                <p style={{ fontSize: bodyPx, lineHeight: 1.8 }}>{f.listMarker} 빈칸 앞뒤 문장에서 핵심어에 밑줄 긋기</p>
                <p style={{ fontSize: bodyPx, lineHeight: 1.8 }}>{f.listMarker} 연결어로 글의 방향 확인하기</p>
              </div>
              <p className="mt-1 text-xs text-sub">실제 크기 비율은 네이버 에디터 표시와 조금 다를 수 있습니다.</p>
            </Field>
          </Section>

          <Section id="set-image" title="이미지 디자인" desc="썸네일과 소주제 이미지(1:1, 1080px)에 공통으로 쓰이는 디자인입니다. 글자·로고는 코드로 그려 정확하게 들어갑니다.">
            <div className="grid gap-6 py-3 md:grid-cols-[1fr_320px]">
              <div className="divide-y divide-bg2">
                <Field label="카드뉴스 템플릿">
                  <div className="flex flex-wrap gap-1">
                    {LAYOUT_CHOICES.map((k) => (
                      <button key={k} className={`btn btn-sm ${LAYOUT_LABEL[im.layout] === LAYOUT_LABEL[k] ? "border-ink font-semibold" : ""}`} onClick={() => setImage({ layout: k })}>
                        {LAYOUT_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="상담 문구" hint="썸네일 위쪽에 표시(파일 폴더·말풍선)">
                  <input className="field" placeholder="예) 무료상담 02-000-0000" value={im.contact ?? ""} onChange={(e) => setImage({ contact: e.target.value })} />
                </Field>
                <Field label="로고" hint="PNG 권장(투명 배경)">
                  <div className="flex items-center gap-3">
                    {im.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={im.logo} alt="로고" className="h-8 border border-line bg-white p-1" />
                    )}
                    <label className="btn btn-sm cursor-pointer">
                      {im.logo ? "바꾸기" : "업로드"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            setImage({ logo: await shrinkImage(file) });
                          } catch {
                            notify("로고 이미지를 읽지 못했습니다.");
                          }
                        }}
                      />
                    </label>
                    {im.logo && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setImage({ logo: null })}>
                        삭제
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="배경색">
                  <ColorInput value={im.bg} onChange={(v) => setImage({ bg: v })} />
                </Field>
                <Field label="제목·주조색">
                  <ColorInput value={im.primary} onChange={(v) => setImage({ primary: v })} />
                </Field>
                <Field label="강조색" hint="강조 줄·하이라이트">
                  <ColorInput value={im.accent} onChange={(v) => setImage({ accent: v })} />
                </Field>
                <Field label="포인트색" hint="요약 문구">
                  <ColorInput value={im.point} onChange={(v) => setImage({ point: v })} />
                </Field>
                <Field label="일러스트 그림체" hint="이미지 API 연결 후 그림에 적용됩니다">
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(ILLUSTRATION_STYLES) as IllustrationStyle[]).map((k) => (
                      <button
                        key={k}
                        className={`btn btn-sm ${im.illustrationStyle === k ? "border-brand bg-brand-soft font-semibold text-brand-dark" : ""}`}
                        onClick={() => setImage({ illustrationStyle: k })}
                      >
                        {ILLUSTRATION_STYLES[k].label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="field mt-2"
                    placeholder="추가 요청(선택) 예) 학생은 교복 차림, 밝은 교실 분위기"
                    value={im.illustrationNote}
                    onChange={(e) => setImage({ illustrationNote: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-sub">학원 색은 그림 전체가 아니라 포인트로만 쓰고, 실제 학원 시설이나 실제 건물처럼 보이게 그리지 않습니다.</p>
                </Field>
                <Field label="하단 띠">
                  <label className="flex items-center gap-1.5 pt-2">
                    <input type="checkbox" checked={im.footer} onChange={(e) => setImage({ footer: e.target.checked })} /> 로고·이름 띠 넣기
                  </label>
                </Field>
              </div>
              <div>
                <p className="label">미리보기 · {LAYOUT_LABEL[im.layout]}</p>
                <DesignPreview design={im} layout={im.layout} />
                <p className="mt-2 text-xs leading-5 text-sub">학원별 예시 이미지를 더 주시면 레이아웃을 추가할 수 있습니다.</p>
              </div>
            </div>
          </Section>

          <Section id="set-brand" title="인사말·예약 링크" desc="붙여넣기 결과에 들어가는 고정 문구입니다. AI가 이 값을 바꾸지 않습니다.">
            <Field label="작성자">
              <input className="field" value={b.author} onChange={(e) => setBrand({ author: e.target.value })} />
            </Field>
            <Field label="인사말" hint="본문 맨 앞에 들어갑니다">
              <input className="field" value={b.greeting} onChange={(e) => setBrand({ greeting: e.target.value })} />
              <NamePreview text={resolveBrand(b, academy).greeting} hasToken={b.greeting.includes(NAME_TOKEN)} onInsert={() => setBrand({ greeting: `안녕하세요! ${NAME_TOKEN}입니다 😊` })} />
            </Field>
            <Field label="마무리 소제목" hint="본문 끝 상담 안내 위에 들어갑니다">
              <input className="field" value={b.closingHeading} onChange={(e) => setBrand({ closingHeading: e.target.value })} />
              <NamePreview text={resolveBrand(b, academy).closingHeading} hasToken={b.closingHeading.includes(NAME_TOKEN)} onInsert={() => setBrand({ closingHeading: `${NAME_TOKEN} 상담 안내` })} />
            </Field>
            <Field label="예약·문의 링크" hint="본문 맨 끝에 붙습니다. 비우면 생략">
              <input className="field" value={b.bookingUrl} onChange={(e) => setBrand({ bookingUrl: e.target.value })} />
            </Field>
            <Field label="학원 전화번호" hint="본문 맨 끝에 작은 굵은 글씨로 붙습니다. 비우면 생략">
              <input className="field" type="tel" value={b.placePhone} onChange={(e) => setBrand({ placePhone: e.target.value })} placeholder="02-000-0000" />
            </Field>
            <Field label="네이버 플레이스 링크" hint="네이버 지도에서 학원 → 공유 → 링크 복사(naver.me/…). 본문 맨 끝에 붙습니다">
              <input className="field" value={b.placeUrl} onChange={(e) => setBrand({ placeUrl: e.target.value })} placeholder="https://naver.me/..." />
            </Field>
          </Section>

          <Section id="set-tags" title="제목·해시태그 규칙" desc="코드가 자동으로 붙이는 값입니다.">
            <Field label="제목 끝 지역 표기" hint="쉼표로 구분 · 글마다 하나씩 순환">
              <ParsedInput
                value={b.titleSuffixes}
                format={(v) => v.join(", ")}
                parse={(s) => s.split(",").map((t) => t.trim()).filter(Boolean)}
                onChange={(v) => setBrand({ titleSuffixes: v })}
              />
            </Field>
            <Field label="고정 해시태그">
              <ParsedInput value={b.fixedHashtags} format={tagsToText} parse={textToTags} onChange={(v) => setBrand({ fixedHashtags: v })} />
            </Field>
            <Field label="지역 해시태그 묶음" hint="한 줄에 한 묶음 · 글마다 한 묶음씩 순환">
              <ParsedInput
                multiline
                rows={Math.max(3, b.regionHashtagGroups.length + 1)}
                value={b.regionHashtagGroups}
                format={(g) => g.map(tagsToText).join("\n")}
                parse={(s) => s.split("\n").map(textToTags).filter((g) => g.length)}
                onChange={(v) => setBrand({ regionHashtagGroups: v })}
              />
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}
