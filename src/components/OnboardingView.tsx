"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Upload, X } from "lucide-react";
import { verticalOf } from "@/lib/prompt/verticals";
import { useLock } from "@/lib/useLock";
import {
  ACADEMY_TYPES,
  GRADE_LEVELS,
  TenantProfileSchema,
  displayName,
  type AcademyType,
  type Source,
  type StyleProfile,
  type TenantProfile,
} from "@/lib/tenant";
import AddressInput from "./AddressInput";
import { PageHeader } from "./ui";

const TONES = [
  '학원 공식 블로그의 정중한 안내문, "~입니다", "~하세요" 위주',
  "차분하고 신뢰감 있는 전문가, 근거를 짚어 설명하는 존댓말",
  "학생 입장에서 쉽게 풀어 쓰는 친근한 존댓말",
  "학부모가 읽기 좋게 정리하는 정중한 상담 말투",
];

const FIELD_LABEL: Record<string, string> = {
  description: "학원 소개",
  location: "위치",
  phone: "대표 전화",
  features: "학원 특징",
  instructors: "강사진",
  subjects: "대표 과목",
  courses: "교육 과정",
  sns: "공식 SNS",
};

interface SiteItem {
  field: keyof typeof FIELD_LABEL;
  value: string;
  evidence: string;
  url: string;
}
interface SiteResult {
  checkedAt: number;
  robots: Source["robots"];
  pages: { url: string; ok: boolean; reason?: string }[];
  items: SiteItem[];
  dropped?: number;
  error?: string;
}

/** 입력 중에는 원문을 유지하고 저장 값은 목록으로 바꾸는 입력 */
function ListInput({
  value,
  onChange,
  sep = "line",
  placeholder,
  rows = 3,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  sep?: "line" | "comma";
  placeholder?: string;
  rows?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const join = sep === "line" ? "\n" : ", ";
  const parse = (s: string) => s.split(sep === "line" ? "\n" : /[,\n]/).map((x) => x.trim()).filter(Boolean);
  const common = {
    className: `field ${sep === "line" ? "resize-none" : ""}`,
    value: text ?? value.join(join),
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange(parse(e.target.value));
    },
    onBlur: () => setText(null),
  };
  return sep === "line" ? <textarea rows={rows} {...common} /> : <input {...common} />;
}

/** 주소를 한 칸에 하나씩 넣고, 칸을 더하거나 뺀다 */
function UrlList({ value, onChange, max = 6 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  // 빈 칸도 화면에는 남겨 두되, 저장 값에서는 뺀다
  const [rows, setRows] = useState<string[]>(value.length ? value : [""]);
  // 홈페이지 분석처럼 밖에서 값이 바뀌면 칸을 다시 맞춘다(입력 중에는 같으므로 그대로)
  const clean = rows.map((x) => x.trim()).filter(Boolean);
  if (clean.join("\n") !== value.join("\n")) setRows(value.length ? value : [""]);
  const update = (next: string[]) => {
    setRows(next);
    onChange(next.map((x) => x.trim()).filter(Boolean));
  };
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1.5">
          <input className="field" value={r} placeholder="https://" onChange={(e) => update(rows.map((x, j) => (j === i ? e.target.value : x)))} />
          {rows.length > 1 && (
            <button type="button" className="btn btn-sm shrink-0" aria-label="이 주소 빼기" onClick={() => update(rows.filter((_, j) => j !== i))}>
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, ""])}>
          <Plus size={13} /> 주소 추가
        </button>
      )}
    </div>
  );
}

function Row({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 py-3 md:grid-cols-[170px_1fr] md:gap-6">
      <div className="pt-2">
        <p className="text-[14px]">
          {label}
          {required && <span className="ml-1 text-brand">*</span>}
        </p>
        {hint && <p className="text-xs leading-5 text-sub">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function OnboardingView({
  initial,
  phone: initialPhone,
  editing,
  onComplete,
  onCancel,
  notify,
}: {
  initial: TenantProfile;
  phone: string;
  editing: boolean;
  onComplete: (t: TenantProfile, phone: string) => void | Promise<void>;
  onCancel: () => void;
  notify: (m: string) => void;
}) {
  const [t, setT] = useState<TenantProfile>(initial);
  const [phone, setPhone] = useState(initialPhone);
  const [more, setMore] = useState(editing);
  // 버튼을 연달아 눌러도 한 번만 실행(학원이 두 번 만들어지지 않게)
  const [runSave, saving] = useLock();
  const [runSite, siteBusy] = useLock();
  const [runStyle, styleBusy] = useLock();
  const set = (p: Partial<TenantProfile>) => setT((x) => ({ ...x, ...p }));
  const v = verticalOf(t.academyType);

  // 홈페이지 분석
  const [consent, setConsent] = useState(false);
  const [site, setSite] = useState<SiteResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // 문체 분석
  const [samples, setSamples] = useState<{ name: string; text: string }[]>([]);
  const [paste, setPaste] = useState("");

  const canSubmit = t.name.trim().length > 0 && (t.academyType !== "기타 교육기관" || !!t.academyTypeCustom.trim());

  const analyzeSite = () =>
    runSite(async () => {
      setSite(null);
      try {
        const r = await fetch("/api/tenant/analyze-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: t.homepage, consent: true }),
        });
        const j = (await r.json().catch(() => ({}))) as SiteResult;
        if (!r.ok && !j.pages) return notify(j.error || "홈페이지를 분석하지 못했습니다.");
        setSite(j);
        setPicked(new Set(j.items.map((_, i) => i)));
      } catch {
        notify("서버에 연결하지 못했습니다.");
      }
    });

  function applySite() {
    if (!site) return;
    const items = site.items.filter((_, i) => picked.has(i));
    const next = { ...t };
    const add = (arr: string[], val: string) => (arr.includes(val) ? arr : [...arr, val]);
    for (const it of items) {
      if (it.field === "description") next.description = it.value;
      else if (it.field === "location") next.location = it.value;
      else if (it.field === "phone") setPhone(it.value);
      else if (it.field === "features") next.features = add(next.features, it.value);
      else if (it.field === "instructors") next.instructors = add(next.instructors, it.value);
      else if (it.field === "subjects" || it.field === "courses") next.courses = add(next.courses, it.value);
      else if (it.field === "sns") next.sns = add(next.sns, it.value);
    }
    const source: Source = {
      url: t.homepage,
      type: "homepage",
      checkedAt: site.checkedAt,
      robots: site.robots,
      consent: true,
      fields: [...new Set(items.map((i) => FIELD_LABEL[i.field]))],
    };
    next.sources = [source, ...next.sources.filter((s) => !(s.type === "homepage" && s.url === source.url))].slice(0, 20);
    setT(next);
    setMore(true);
    notify(`${items.length}개 항목을 반영했습니다`);
  }

  async function readFiles(files: FileList | null) {
    if (!files) return;
    const list = await Promise.all(
      [...files].slice(0, 3).map(async (f) => ({ name: f.name, text: (await f.text()).trim() })),
    );
    setSamples((s) => [...s, ...list.filter((x) => x.text.length >= 200)].slice(0, 3));
    if (list.some((x) => x.text.length < 200)) notify("200자보다 짧은 글은 제외했습니다.");
  }

  const analyzeStyle = () =>
    runStyle(async () => {
      // 주소만 적은 줄은 서버가 읽고, 나머지는 붙여 넣은 글로 쓴다
      const lines = paste.split("\n").map((x) => x.trim());
      const urls = lines.filter((x) => /^https?:\/\/\S+$/i.test(x)).slice(0, 3);
      const text = lines.filter((x) => !urls.includes(x)).join("\n").trim();
      const all = [...samples, ...(text.length >= 200 ? [{ name: "붙여넣은 글", text }] : [])].slice(0, 3);
      if (!all.length && !urls.length) return notify("기존 블로그 글 주소나 내용을 붙여 넣어 주세요(내용은 200자 이상).");
      try {
        const r = await fetch("/api/tenant/analyze-style", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ samples: all.map((s) => ({ ...s, text: s.text.slice(0, 15000) })), urls: urls.slice(0, 3 - all.length) }),
        });
        const j = (await r.json().catch(() => ({}))) as { profile?: StyleProfile | null; excerpts?: string[]; read?: string[]; failed?: string[]; error?: string };
        if (!r.ok) return notify(j.error || "문체를 분석하지 못했습니다.");
        set({
          styleProfile: j.profile ?? null,
          styleExcerpts: j.excerpts ?? [],
          sources: [
            ...(j.read ?? all.map((s) => s.name)).map((name): Source => ({ url: name, type: "blog_sample", checkedAt: Date.now(), robots: "n/a", consent: true, fields: ["문체"] })),
            ...t.sources.filter((s) => s.type !== "blog_sample"),
          ].slice(0, 20),
        });
        const skipped = j.failed?.length ? ` · 읽지 못한 주소: ${j.failed.join(" / ")}` : "";
        notify((j.profile ? "문체를 분석했습니다" : "글을 저장했습니다(샘플 모드라 분석은 생략)") + skipped);
      } catch {
        notify("서버에 연결하지 못했습니다.");
      }
    });

  const finish = () =>
    runSave(async () => {
      const r = TenantProfileSchema.safeParse({ ...t, onboardedAt: t.onboardedAt ?? Date.now() });
      if (!r.success) return notify("학원 유형과 학원명을 확인해 주세요.");
      await onComplete(r.data, phone.trim());
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={editing ? "학원 정보 수정" : "학원 정보 등록"}
        sub={editing ? displayName(t) : "처음 한 번만 등록하면 모든 글과 이미지에 적용됩니다"}
        actions={
          editing ? (
            <button className="btn" onClick={onCancel}>
              취소
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] divide-y divide-bg2 px-5 py-4 text-[14px] md:px-8">
          <Row label="학원 유형" required>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {ACADEMY_TYPES.map((a) => (
                <button
                  key={a}
                  className={`btn justify-start ${t.academyType === a ? "border-ink font-semibold" : ""}`}
                  onClick={() => set({ academyType: a as AcademyType })}
                >
                  {a}
                </button>
              ))}
            </div>
            {t.academyType === "기타 교육기관" && (
              <input
                className="field mt-2"
                placeholder="교육기관 유형을 입력하세요 (예: 코딩학원, 미술학원)"
                value={t.academyTypeCustom}
                onChange={(e) => set({ academyTypeCustom: e.target.value })}
              />
            )}
          </Row>
          <Row label="가르치는 학년" hint="여러 개 고를 수 있어요">
            <div className="flex flex-wrap gap-1">
              {GRADE_LEVELS.map((g) => {
                const on = t.grades.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    className={`btn btn-sm ${on ? "border-ink font-semibold" : ""}`}
                    onClick={() => set({ grades: on ? t.grades.filter((x) => x !== g) : GRADE_LEVELS.filter((x) => x === g || t.grades.includes(x)) })}
                  >
                    {on && <Check size={12} />} {g}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="학원명" required>
            <input className="field" value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="예) 바른영어학원" />
          </Row>
          <Row label="지점명">
            <input className="field" value={t.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="예) 분당점" />
          </Row>
          <Row label="학원 주소">
            <AddressInput value={t.location} onChange={(x) => set({ location: x })} notify={notify} />
          </Row>
          <Row label="대표 전화">
            <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="02-000-0000" />
          </Row>
          <Row label="학원 홈페이지" hint="있으면 학원 정보를 자동으로 찾아 드립니다">
            <div className="space-y-2">
              <input className="field" value={t.homepage} onChange={(e) => set({ homepage: e.target.value })} placeholder="https://" />
              {t.homepage.trim() && (
                <div className="rounded-2xl border border-line p-4">
                  <label className="flex items-start gap-2 text-xs leading-5">
                    <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                      학원 홈페이지에서 누구나 볼 수 있는 페이지를 읽어 학원 정보를 찾는 데 동의합니다. 홈페이지가 읽지 말라고 표시한 페이지와 로그인해야 보이는 페이지는 읽지 않고, 페이지에 없는 정보는 지어내지 않습니다.
                    </span>
                  </label>
                  <button className="btn btn-sm mt-2" disabled={!consent || siteBusy} onClick={analyzeSite}>
                    {siteBusy && <Loader2 size={13} className="animate-spin" />} 홈페이지에서 정보 찾기
                  </button>
                  {site && (
                    <div className="mt-3 space-y-2 text-xs">
                      <p className="text-sub">
                        확인 {new Date(site.checkedAt).toLocaleString("ko-KR")} · 읽기 허용 여부 {site.robots === "allowed" ? "확인함" : site.robots === "missing" ? "표시 없음(허용으로 봄)" : "확인 못 함"} · 읽은 페이지{" "}
                        {site.pages.filter((p) => p.ok).length}/{site.pages.length}
                      </p>
                      {site.pages.filter((p) => !p.ok).map((p) => (
                        <p key={p.url} className="text-sub">
                          읽지 않음: {p.url} ({p.reason})
                        </p>
                      ))}
                      {site.error && <p className="text-err">{site.error}</p>}
                      {site.items.length === 0 && !site.error && <p>홈페이지에서 찾은 학원 정보가 없습니다.</p>}
                      {site.items.length > 0 && (
                        <>
                          <ul className="divide-y divide-bg2 overflow-hidden rounded-xl border border-line">
                            {site.items.map((it, i) => (
                              <li key={i} className="flex gap-2 p-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={picked.has(i)}
                                  onChange={(e) => {
                                    const n = new Set(picked);
                                    if (e.target.checked) n.add(i);
                                    else n.delete(i);
                                    setPicked(n);
                                  }}
                                />
                                <div className="min-w-0">
                                  <p>
                                    <span className="text-sub">{FIELD_LABEL[it.field]} · </span>
                                    {it.value}
                                  </p>
                                  <p className="truncate text-sub" title={it.evidence}>
                                    근거: “{it.evidence}” · {it.url}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <button className="btn btn-sm" onClick={applySite} disabled={!picked.size}>
                            선택한 {picked.size}개 반영
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Row>

          <details className="py-3" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
            <summary className="cursor-pointer select-none py-2 text-[14px] font-semibold">
              추가 입력하기 <span className="font-normal text-sub">(선택 · 채울수록 우리 학원에 맞는 글이 나와요)</span>
            </summary>
            <div className="divide-y divide-bg2">
              <Row label="학원 소개" hint="어떤 학원인지 두세 문장으로">
                <textarea className="field resize-none" rows={3} value={t.description} onChange={(e) => set({ description: e.target.value })} />
              </Row>
              <Row label="학원의 특징" hint="다른 학원과 다른 점 · 한 줄에 하나 · 적은 내용만 글에 씁니다">
                <ListInput value={t.features} onChange={(x) => set({ features: x })} />
              </Row>
              <Row label="강사진" hint="한 줄에 한 명 (예: 김OO · 영어 문법)">
                <ListInput value={t.instructors} onChange={(x) => set({ instructors: x })} />
              </Row>
              <Row label="운영하는 수업" hint="반·과정 이름 · 한 줄에 하나 (예: 중2 내신반)">
                <ListInput value={t.courses} onChange={(x) => set({ courses: x })} />
              </Row>
              <Row label="블로그·SNS 주소" hint="한 칸에 주소 하나">
                <UrlList value={t.sns} onChange={(x) => set({ sns: x })} />
              </Row>
              <Row label="주로 읽을 사람" hint="글을 읽을 사람 (예: 중학생 자녀를 둔 학부모)">
                <input className="field" value={t.targetAudience} onChange={(e) => set({ targetAudience: e.target.value })} placeholder={v.defaultAudience} />
              </Row>
              <Row label="글 말투" hint="글을 어떤 말투로 쓸지">
                <select
                  className="field h-9 py-0"
                  value={TONES.includes(t.tone) ? t.tone : t.tone ? "__custom" : TONES[0]}
                  onChange={(e) => set({ tone: e.target.value === "__custom" ? " " : e.target.value })}
                >
                  {TONES.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                  <option value="__custom">직접 입력</option>
                </select>
                {t.tone && !TONES.includes(t.tone) && (
                  <input className="field mt-2" value={t.tone.trimStart()} onChange={(e) => set({ tone: e.target.value })} placeholder="원하는 말투를 설명해 주세요" />
                )}
              </Row>
              <Row label="자주 쓸 글 주제" hint="새 글 화면에 예시로 보여 줍니다 · 고르거나 직접 추가">
                <div className="flex flex-wrap gap-1">
                  {[...new Set([...v.defaultTopics, ...t.topics])].map((x) => {
                    const on = t.topics.includes(x);
                    return (
                      <button
                        key={x}
                        className={`btn btn-sm ${on ? "border-ink font-semibold" : ""}`}
                        onClick={() => set({ topics: on ? t.topics.filter((y) => y !== x) : [...t.topics, x] })}
                      >
                        {on && <Check size={12} />} {x}
                      </button>
                    );
                  })}
                </div>
                <input
                  className="field mt-2"
                  placeholder="주제 추가 후 Enter"
                  onKeyDown={(e) => {
                    const val = e.currentTarget.value.trim();
                    if (e.key === "Enter" && val) {
                      set({ topics: [...new Set([...t.topics, val])] });
                      e.currentTarget.value = "";
                    }
                  }}
                />
              </Row>
              <Row label="동네 검색어" hint="학부모가 학원을 찾을 때 검색창에 치는 동네 이름이에요. 글에 한두 번 자연스럽게 넣어 검색에 잘 걸리게 합니다 · 쉼표로 구분">
                <ListInput sep="comma" value={t.seoKeywords} onChange={(x) => set({ seoKeywords: x })} placeholder={v.seoPatterns.join(", ")} />
              </Row>
              <Row label="기존 블로그 글" hint="최대 3개 · 글 주소나 글 내용을 붙여 넣으면 그 말투를 따라 씁니다(내용은 가져오지 않아요)">
                <div className="space-y-2">
                  <label className="btn btn-sm cursor-pointer">
                    <Upload size={13} /> 파일 올리기
                    <input type="file" multiple accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => readFiles(e.target.files)} />
                  </label>
                  {samples.length > 0 && (
                    <ul className="text-xs">
                      {samples.map((s, i) => (
                        <li key={i} className="flex items-center gap-2 py-0.5">
                          <span className="flex-1 truncate">{s.name}</span>
                          <span className="text-sub">{s.text.length.toLocaleString()}자</span>
                          <button className="text-sub hover:text-ink" onClick={() => setSamples(samples.filter((_, j) => j !== i))}>
                            빼기
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <textarea className="field resize-none" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"글 주소를 한 줄에 하나씩 붙여 넣거나, 글 내용을 그대로 붙여 넣으세요\n예) https://myacademy.tistory.com/12\n(네이버 블로그는 주소로 읽을 수 없어 글 내용을 붙여 넣어야 해요)"} />
                  <button className="btn btn-sm" disabled={styleBusy} onClick={analyzeStyle}>
                    {styleBusy && <Loader2 size={13} className="animate-spin" />} 문체 분석
                  </button>
                  {t.styleProfile && (
                    <dl className="space-y-1 rounded-2xl border border-line p-4 text-xs leading-5">
                      <div><dt className="inline text-sub">말투 </dt><dd className="inline">{t.styleProfile.tone}</dd></div>
                      <div><dt className="inline text-sub">종결 표현 </dt><dd className="inline">{t.styleProfile.sentenceEndings.join(", ")}</dd></div>
                      <div><dt className="inline text-sub">도입부 </dt><dd className="inline">{t.styleProfile.introPattern}</dd></div>
                      <div><dt className="inline text-sub">소제목 </dt><dd className="inline">{t.styleProfile.headingStyle}</dd></div>
                      <div><dt className="inline text-sub">구성 </dt><dd className="inline">{t.styleProfile.structure}</dd></div>
                      <div><dt className="inline text-sub">마무리 </dt><dd className="inline">{t.styleProfile.closingPattern}</dd></div>
                      <button className="text-sub underline" onClick={() => set({ styleProfile: null, styleExcerpts: [] })}>분석 결과 지우기</button>
                    </dl>
                  )}
                  {!t.styleProfile && t.styleExcerpts.length > 0 && <p className="text-xs text-sub">기존 글 {t.styleExcerpts.length}개 발췌가 저장되어 있습니다.</p>}
                </div>
              </Row>
            </div>
          </details>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3 md:px-8">
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-3">
          <span className="flex-1 text-xs text-sub">* 표시만 필수입니다. 나머지는 나중에 채워도 됩니다.</span>
          <button className="btn btn-primary" disabled={!canSubmit || saving} onClick={finish}>
            {saving ? "처리 중…" : editing ? "저장" : "완료하고 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
