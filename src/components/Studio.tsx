"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { derive } from "@/lib/derive";
import { idbDel, idbSet } from "@/lib/idb";
import { targetKey, type ImageCopy, type ImageTarget } from "@/lib/imageCopy";
import type { Analysis, Draft, Plan } from "@/lib/schemas";
import { verticalOf } from "@/lib/prompt/verticals";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { EMPTY_TENANT, displayName, localTenantRepository, type TenantProfile } from "@/lib/tenant";
import {
  loadDocs,
  loadHistory,
  newId,
  saveDocs,
  saveHistory,
  type DocRecord,
  type HistoryEntry,
  type ImageItem,
} from "@/lib/store";
import OnboardingView from "./OnboardingView";
import ComposeView, { type Form, type StageState } from "./ComposeView";
import EditorView, { type SaveState } from "./EditorView";
import { imageFileName, saveBlob } from "./exporter";
import { copyBusyKey, type ImageActions } from "./images";
import Logo from "./Logo";
import { HistoryView, ListView } from "./Pages";
import PublishView from "./PublishView";
import SettingsView from "./SettingsView";
import Sidebar, { type ApiState } from "./Sidebar";
import { illustrationKey, renderBlob } from "./useRendered";

export type Route =
  | { name: "compose" }
  | { name: "list" }
  | { name: "history" }
  | { name: "settings" }
  | { name: "onboarding" }
  | { name: "edit"; id: string }
  | { name: "publish"; id: string };

function parseHash(h: string): Route {
  const [name, id] = h.replace(/^#\/?/, "").split("/");
  if (name === "list" || name === "history" || name === "settings" || name === "onboarding") return { name };
  if (name === "brand") return { name: "settings" };
  if ((name === "edit" || name === "publish") && id) return { name, id };
  return { name: "compose" };
}
const toHash = (r: Route) => "#/" + ("id" in r ? `${r.name}/${r.id}` : r.name);

const IDLE: StageState = { analysis: "idle", plan: "idle", draft: "idle", images: "idle" };

const allTargets = (d: Draft): ImageTarget[] => [
  { kind: "thumbnail", sectionIndex: null },
  ...d.sections.map((_, i) => ({ kind: "section" as const, sectionIndex: i })),
];

export default function Studio() {
  const [route, setRoute] = useState<Route>({ name: "compose" });
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [api, setApi] = useState<ApiState>({ checked: false, mock: false, model: null, ok: false, illustration: false });
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [openImage, setOpenImage] = useState<string | null>(null);

  const [form, setForm] = useState<Form>({ topic: "", contentType: "", regionIndex: null, images: true });
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageState>(IDLE);
  const [genError, setGenError] = useState<string | null>(null);
  const cache = useRef<{ analysis?: Analysis; plan?: Plan }>({});

  const dirty = useRef(false);
  const docsRef = useRef<DocRecord[]>([]);
  docsRef.current = docs;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  // ---------- 라우팅 ----------
  const go = useCallback((r: Route) => {
    setMenu(false);
    setOpenImage(null);
    window.location.hash = toHash(r);
  }, []);
  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // ---------- 저장소 ----------
  useEffect(() => {
    setDocs(loadDocs());
    setHistory(loadHistory());
    setSettings(loadSettings());
    setTenant(localTenantRepository.load());
    setReady(true);
  }, []);

  const mutateDocs = useCallback((fn: (d: DocRecord[]) => DocRecord[]) => {
    dirty.current = true;
    setSave({ state: "saving" });
    setDocs(fn);
  }, []);

  useEffect(() => {
    if (!ready || !dirty.current) return;
    const t = setTimeout(() => {
      const ok = saveDocs(docs);
      dirty.current = false;
      setSave(ok ? { state: "saved", at: Date.now() } : { state: "error" });
    }, 400);
    return () => clearTimeout(t);
  }, [docs, ready]);

  const updateSettings = useCallback(
    (s: Settings) => {
      setSettings(s);
      if (!saveSettings(s)) notify("설정을 저장하지 못했습니다. 로고 파일 크기를 줄여 보세요.");
    },
    [notify],
  );

  const addHistory = useCallback((e: Omit<HistoryEntry, "id" | "at">) => {
    setHistory((prev) => {
      const next = [{ ...e, id: newId(), at: Date.now() }, ...prev];
      saveHistory(next);
      return next;
    });
  }, []);

  // ---------- API 상태 ----------
  const checkApi = useCallback(async () => {
    setApi((a) => ({ ...a, checked: false }));
    try {
      const j = await (await fetch("/api/status?check=1", { cache: "no-store" })).json();
      setApi({ checked: true, mock: !!j.mock, model: j.model ?? null, ok: !!j.ok, illustration: !!j.illustration, message: j.message });
    } catch {
      setApi({ checked: true, mock: false, model: null, ok: false, illustration: false, message: "서버에 연결하지 못했습니다." });
    }
  }, []);
  useEffect(() => {
    checkApi();
  }, [checkApi]);

  // ---------- 이미지 ----------
  const setBusyKey = (k: string, v: boolean) =>
    setBusyMap((m) => {
      const n = { ...m };
      if (v) n[k] = true;
      else delete n[k];
      return n;
    });

  const patchImages = useCallback(
    (docId: string, fn: (imgs: ImageItem[]) => ImageItem[]) =>
      mutateDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, images: fn(d.images ?? []), updatedAt: Date.now() } : d))),
    [mutateDocs],
  );

  /** 지정한 자리의 이미지 문구를 (다시) 만든다. 다른 이미지는 건드리지 않는다. */
  const requestCopy = useCallback(
    async (docId: string, targets: ImageTarget[], draftOverride?: Draft, meta?: { topic: string; contentType: string }): Promise<string | null> => {
      const doc = docsRef.current.find((d) => d.id === docId);
      const draft = draftOverride ?? doc?.draft;
      if (!draft) return "문서를 찾을 수 없습니다.";
      targets.forEach((t) => setBusyKey(copyBusyKey(t), true));
      try {
        const r = await fetch("/api/images/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: meta?.topic ?? doc?.topic ?? "",
            contentType: meta?.contentType ?? doc?.contentType ?? "",
            draft,
            brand: settings.brand,
            tenant,
            targets,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return j.error || "이미지 문구를 만들지 못했습니다.";
        const got = j.items as { kind: ImageTarget["kind"]; sectionIndex: number | null; copy: ImageCopy }[];
        patchImages(docId, (imgs) => {
          const next = [...imgs];
          for (const g of got) {
            const i = next.findIndex((x) => targetKey(x) === targetKey(g));
            if (i >= 0) next[i] = { ...next[i], copy: g.copy, updatedAt: Date.now() };
            else next.push({ id: newId(), kind: g.kind, sectionIndex: g.sectionIndex, copy: g.copy, illustration: "none", updatedAt: Date.now() });
          }
          return next;
        });
        return null;
      } catch {
        return "서버에 연결하지 못했습니다.";
      } finally {
        targets.forEach((t) => setBusyKey(copyBusyKey(t), false));
      }
    },
    [patchImages, settings.brand, tenant],
  );

  const illustrate = useCallback(
    async (docId: string, itemId: string) => {
      const item = docsRef.current.find((d) => d.id === docId)?.images?.find((i) => i.id === itemId);
      if (!item) return;
      setBusyKey(`ill:${itemId}`, true);
      try {
        const r = await fetch("/api/images/illustration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene: item.copy.scene || item.copy.title.join(" ") }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.dataUrl) return notify(j.error || "일러스트를 만들지 못했습니다.");
        if (!(await idbSet(illustrationKey(itemId), j.dataUrl))) return notify("일러스트를 저장하지 못했습니다.");
        patchImages(docId, (imgs) => imgs.map((x) => (x.id === itemId ? { ...x, illustration: "ready", updatedAt: Date.now() } : x)));
      } catch {
        notify("이미지 서버에 연결하지 못했습니다.");
      } finally {
        setBusyKey(`ill:${itemId}`, false);
      }
    },
    [notify, patchImages],
  );

  const makeActions = (doc: DocRecord): ImageActions => ({
    design: settings.image,
    busy: busyMap,
    illustrationEnabled: api.illustration,
    aiEnabled: true,
    regenerate: async (t) => {
      const err = await requestCopy(doc.id, [{ kind: t.kind, sectionIndex: t.sectionIndex }]);
      if (err) notify(err);
    },
    illustrate: (id) => illustrate(doc.id, id),
    update: (id, patch) => patchImages(doc.id, (imgs) => imgs.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x))),
    remove: (id) => {
      patchImages(doc.id, (imgs) => imgs.filter((x) => x.id !== id));
      idbDel(illustrationKey(id));
    },
    removeIllustration: (id) => {
      patchImages(doc.id, (imgs) => imgs.map((x) => (x.id === id ? { ...x, illustration: "none", updatedAt: Date.now() } : x)));
      idbDel(illustrationKey(id));
    },
    download: async (item) => {
      try {
        saveBlob(await renderBlob(item, settings.image), imageFileName(doc.images ?? [], item));
      } catch {
        notify("이미지를 만들지 못했습니다.");
      }
    },
    open: (id) => setOpenImage(id),
  });

  // ---------- 생성 ----------
  async function generate(resume: boolean) {
    setBusy(true);
    setGenError(null);
    if (!resume) {
      cache.current = {};
      setStages(IDLE);
    }
    const input = { ...form, topic: form.topic.trim() };
    let failedMsg: string | null = null;
    let created: DocRecord | null = null;
    let wasMock = api.mock;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: input.topic,
          contentType: input.contentType,
          regionIndex: input.regionIndex,
          brand: settings.brand,
          tenant,
          resume: resume ? cache.current : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") wasMock = !!ev.mock;
          if (ev.type === "stage") {
            setStages((s) => ({ ...s, [ev.stage]: ev.status }));
            if (ev.status === "done" && ev.stage === "analysis") cache.current = { ...cache.current, analysis: ev.data };
            if (ev.status === "done" && ev.stage === "plan") cache.current = { ...cache.current, plan: ev.data };
          }
          if (ev.type === "result") {
            const now = Date.now();
            created = {
              id: newId(),
              title: ev.draft.title,
              topic: input.topic,
              contentType: input.contentType,
              mock: !!ev.mock,
              plan: ev.plan,
              regionIndex: ev.regionIndex,
              draft: ev.draft,
              images: [],
              createdAt: now,
              updatedAt: now,
            };
            const doc = created;
            mutateDocs((d) => [doc, ...d]);
          }
          if (ev.type === "error") {
            setStages((s) => ({ ...s, [ev.stage]: "error" }));
            failedMsg = ev.message;
          }
        }
      }
      if (!created && !failedMsg) failedMsg = "생성 결과를 받지 못했습니다. 다시 시도해 주세요.";
    } catch (e) {
      failedMsg = e instanceof Error ? e.message : "서버에 연결하지 못했습니다.";
    }

    const doc = created as DocRecord | null;
    if (doc) {
      // 이미지 문구는 글이 저장된 뒤 만든다. 실패해도 글은 그대로 남는다.
      if (input.images) {
        setStages((s) => ({ ...s, images: "running" }));
        const err = await requestCopy(doc.id, allTargets(doc.draft), doc.draft, { topic: doc.topic, contentType: doc.contentType });
        setStages((s) => ({ ...s, images: err ? "error" : "done" }));
        if (err) notify(`글은 저장되었습니다. 이미지는 편집 화면에서 다시 만들어 주세요. (${err})`);
      }
      setBusy(false);
      addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "success", docId: doc.id });
      setForm((f) => ({ ...f, topic: "" }));
      cache.current = {};
      setStages(IDLE);
      go({ name: "edit", id: doc.id });
    } else {
      setBusy(false);
      if (failedMsg) {
        setGenError(failedMsg);
        addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "error", message: failedMsg });
      }
    }
  }

  // 일러스트 API가 있으면 새로 만든 이미지에 일러스트를 차례로 붙인다(백그라운드)
  const autoIllustrated = useRef(new Set<string>());
  useEffect(() => {
    if (!api.illustration) return;
    for (const d of docs) {
      for (const it of d.images ?? []) {
        if (it.illustration !== "none" || autoIllustrated.current.has(it.id) || Date.now() - d.createdAt > 10 * 60_000) continue;
        autoIllustrated.current.add(it.id);
        illustrate(d.id, it.id);
      }
    }
  }, [docs, api.illustration, illustrate]);

  // ---------- 편집 ----------
  const onDraftChange = useCallback(
    (id: string, draft: Draft) =>
      mutateDocs((ds) => ds.map((d) => (d.id === id ? { ...d, draft, title: draft.title, updatedAt: Date.now() } : d))),
    [mutateDocs],
  );

  const doc = "id" in route ? docs.find((d) => d.id === route.id) : undefined;
  const derived = useMemo(() => (doc ? derive(doc, settings, tenant?.prohibited ?? []) : null), [doc, settings, tenant]);

  // ---------- 학원(테넌트) ----------
  const vertical = verticalOf(tenant?.academyType ?? "기타 교육기관");
  useEffect(() => {
    if (!vertical.contentTypes.includes(form.contentType)) setForm((f) => ({ ...f, contentType: vertical.contentTypes[0] }));
  }, [vertical, form.contentType]);
  const needsOnboarding = ready && !tenant?.onboardedAt;

  function completeOnboarding(t: TenantProfile, patch: { logo: string | null; phone: string; importedSettings?: Partial<Settings> }) {
    if (!localTenantRepository.save(t)) return notify("학원 정보를 저장하지 못했습니다. 브라우저 저장공간을 확인해 주세요.");
    const imp = patch.importedSettings;
    const base: Settings = imp
      ? {
          brand: { ...settings.brand, ...imp.brand },
          format: { ...settings.format, ...imp.format },
          image: { ...settings.image, ...imp.image },
        }
      : settings;
    const name = displayName(t);
    const oldName = tenant ? displayName(tenant) : "";
    const b = base.brand;
    // 비어 있거나 예전 학원명으로 자동 생성된 값만 새 학원명으로 채운다(사용자가 직접 바꾼 값은 유지)
    const auto = (cur: string, make: (n: string) => string) => (!cur || (oldName && cur === make(oldName)) ? make(name) : cur);
    updateSettings({
      ...base,
      brand: {
        ...b,
        name,
        author: auto(b.author, (n) => n),
        greeting: auto(b.greeting, (n) => `안녕하세요! ${n}입니다.`),
        closingHeading: auto(b.closingHeading, (n) => `${n} 상담 안내`),
        placeName: auto(b.placeName, (n) => n),
        placeAddress: b.placeAddress || t.location,
        placePhone: patch.phone || b.placePhone,
      },
      image: {
        ...base.image,
        label: auto(base.image.label, (n) => n),
        logo: patch.logo,
        primary: t.primaryColor && base.image.primary === DEFAULT_SETTINGS.image.primary ? t.primaryColor : base.image.primary,
      },
    });
    setTenant(t);
    notify(tenant?.onboardedAt ? "학원 정보를 저장했습니다" : "학원 정보를 등록했습니다. 첫 글을 만들어 보세요.");
    go({ name: "compose" });
  }

  function exportTenant() {
    if (!tenant) return;
    const blob = new Blob([JSON.stringify({ tenant, settings }, null, 2)], { type: "application/json" });
    saveBlob(blob, `${displayName(tenant) || "학원"}-설정.json`);
  }

  function deleteDoc(id: string) {
    const d = docs.find((x) => x.id === id);
    d?.images?.forEach((i) => idbDel(illustrationKey(i.id)));
    mutateDocs((ds) => ds.filter((x) => x.id !== id));
    notify("삭제했습니다");
  }

  // ---------- 렌더 ----------
  let view: React.ReactNode;
  if (!ready) {
    view = null;
  } else if (needsOnboarding || route.name === "onboarding") {
    view = (
      <OnboardingView
        key={tenant?.onboardedAt ?? "new"}
        initial={tenant ?? { ...EMPTY_TENANT, name: settings.brand.name }}
        settings={settings}
        editing={!!tenant?.onboardedAt}
        onComplete={completeOnboarding}
        onCancel={() => go({ name: "settings" })}
        notify={notify}
      />
    );
  } else if (route.name === "compose") {
    view = (
      <ComposeView
        form={form}
        setForm={setForm}
        brand={settings.brand}
        contentTypes={vertical.contentTypes}
        topicPlaceholder={`예) ${vertical.titleExamples[0].split("｜")[0]}`}
        busy={busy}
        stages={stages}
        error={genError}
        canResume={!!(cache.current.analysis || cache.current.plan)}
        recent={docs.slice(0, 5)}
        onGenerate={generate}
        onOpen={(id) => go({ name: "edit", id })}
        onHistory={() => go({ name: "history" })}
        notify={notify}
      />
    );
  } else if (route.name === "list") {
    view = (
      <ListView
        docs={docs}
        onNew={() => go({ name: "compose" })}
        onOpen={(id) => go({ name: "edit", id })}
        onPublish={(id) => go({ name: "publish", id })}
        onDelete={deleteDoc}
      />
    );
  } else if (route.name === "history") {
    view = <HistoryView history={history} onOpen={(id) => go({ name: "edit", id })} hasDoc={(id) => docs.some((d) => d.id === id)} />;
  } else if (route.name === "settings") {
    view = (
      <SettingsView
        settings={settings}
        onChange={updateSettings}
        notify={notify}
        tenant={tenant}
        onEditTenant={() => go({ name: "onboarding" })}
        onExport={exportTenant}
      />
    );
  } else if (!doc || !derived) {
    view = (
      <div className="m-auto text-center text-sub">
        <p>콘텐츠를 찾을 수 없습니다. 이 브라우저에 저장된 문서만 열 수 있습니다.</p>
        <button className="btn mt-4" onClick={() => go({ name: "list" })}>콘텐츠 목록으로</button>
      </div>
    );
  } else if (route.name === "edit") {
    view = (
      <EditorView
        key={doc.id}
        doc={doc}
        quality={derived.quality}
        settings={settings}
        tenant={tenant}
        save={save}
        aiEnabled={api.checked && api.ok && !doc.mock}
        imageActions={makeActions(doc)}
        openImage={openImage}
        onCloseImage={() => setOpenImage(null)}
        onChange={(d) => onDraftChange(doc.id, d)}
        onPublish={() => go({ name: "publish", id: doc.id })}
      />
    );
  } else {
    view = (
      <PublishView
        doc={doc}
        settings={settings}
        quality={derived.quality}
        html={derived.html}
        plainText={derived.plainText}
        onBack={() => go({ name: "edit", id: doc.id })}
        notify={notify}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 lg:hidden">
        <button className="btn btn-sm" onClick={() => setMenu((m) => !m)} aria-label="메뉴" aria-expanded={menu}>
          <Menu size={16} />
        </button>
        <Logo />
      </div>
      <aside className={`${menu ? "block" : "hidden"} absolute inset-x-0 top-12 z-40 border-b border-line shadow-md lg:static lg:block lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-none`}>
        <Sidebar
          route={route}
          count={docs.length}
          api={api}
          tenantName={tenant?.onboardedAt ? displayName(tenant) : ""}
          locked={needsOnboarding}
          onNavigate={go}
          onRecheck={checkApi}
        />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{view}</main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 bg-ink px-4 py-2 text-[13px] text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
