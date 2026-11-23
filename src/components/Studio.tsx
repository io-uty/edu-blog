"use client";

import { LogIn, LogOut, Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derive } from "@/lib/derive";
import { idbDel, idbSet } from "@/lib/idb";
import { targetKey, type ImageCopy, type ImageTarget } from "@/lib/imageCopy";
import type { Analysis, Draft, Plan } from "@/lib/schemas";
import { verticalOf } from "@/lib/prompt/verticals";
import { AUTO_CLOSING, AUTO_GREETING, DEFAULT_SETTINGS, loadSettings, saveSettings, type ImageLayout, type Settings } from "@/lib/settings";
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
import Logo from "./Logo";
import Paywall from "./Paywall";
import { contentLeft, type PaymentInfo, type PlanInfo, type UsageInfo } from "@/lib/billingTypes";
import ComposeView, { type Form, type StageState } from "./ComposeView";
import EditorView, { type SaveState } from "./EditorView";
import { imageFileName, saveBlob } from "./exporter";
import { copyBusyKey, type ImageActions } from "./images";
import { HistoryView, ListView } from "./Pages";
import PublishView from "./PublishView";
import SettingsView from "./SettingsView";
import Sidebar, { type ApiState } from "./Sidebar";
import { illustrationKey, renderBlob } from "./useRendered";
import { autoLayout } from "@/lib/imageRender";
import { useLock } from "@/lib/useLock";

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

/** 레이아웃별로 사진에서 비워 둘 자리 */
function compositionFor(layout: ImageLayout): "poster" | "side" | "plain" {
  if (layout === "poster" || layout === "scene") return "poster";
  if (layout === "bold" || layout === "summary") return "plain";
  return "side";
}

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
  const [runBuy] = useLock();
  const [stages, setStages] = useState<StageState>(IDLE);
  const [genError, setGenError] = useState<string | null>(null);
  const cache = useRef<{ analysis?: Analysis; plan?: Plan }>({});

  const dirty = useRef(false);
  const docsRef = useRef<DocRecord[]>([]);
  docsRef.current = docs;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((m: string, ms = Math.max(2600, Math.min(9000, m.length * 110))) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms); // 긴 안내는 읽을 시간만큼 더 오래 보여준다
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
  // cloud: 로그인 + Supabase(서버 DB, 학원별 분리) / null: Supabase 미설정 로컬 모드(브라우저 저장)
  const [cloud, setCloud] = useState<{ email: string; tenantId: string | null } | null>(null);
  const [localSeed, setLocalSeed] = useState<TenantProfile | null>(null);
  const [localImport, setLocalImport] = useState<DocRecord[]>([]);
  const persisted = useRef(new Map<string, DocRecord>()); // 서버에 마지막으로 저장한 문서
  const settingsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [billing, setBilling] = useState<{ usage: UsageInfo | null; plans: PlanInfo[]; payment?: PaymentInfo } | null>(null);
  const [quotaHit, setQuotaHit] = useState(false);
  const loadUsage = useCallback(async () => {
    const r = await fetch("/api/usage", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.mode === "cloud") {
      setBilling({ usage: j.usage ?? null, plans: j.plans ?? [], payment: j.payment });
      setQuotaHit(false);
    }
  }, []);

  const loadCloudDocs = useCallback(async (tenantId: string) => {
    const r = await fetch("/api/projects", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    const list: DocRecord[] = j.docs ?? [];
    persisted.current = new Map(list.map((d) => [d.id, d]));
    setDocs(list);
    const local = loadDocs();
    if (local.length && localStorage.getItem(`ebs:imported:${tenantId}`) !== "1") setLocalImport(local);
  }, []);

  useEffect(() => {
    (async () => {
      setHistory(loadHistory());
      let me: { mode?: string; user?: { email: string }; tenantId?: string; tenant?: TenantProfile | null; settings?: Settings | null } | null = null;
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          window.location.href = "/login";
          return;
        }
        me = await r.json();
      } catch {
        me = null;
      }
      if (me?.mode === "cloud" && me.user) {
        setCloud({ email: me.user.email, tenantId: me.tenantId ?? null });
        if (me.tenant && me.tenantId) {
          setTenant(me.tenant);
          setSettings(me.settings ?? DEFAULT_SETTINGS);
          await Promise.all([loadCloudDocs(me.tenantId), loadUsage()]);
        } else {
          // 첫 로그인: 이 브라우저에 쓰던 학원 정보·설정이 있으면 온보딩 초안으로 쓴다
          setLocalSeed(localTenantRepository.load());
          setSettings(loadSettings());
        }
      } else {
        setDocs(loadDocs());
        setSettings(loadSettings());
        setTenant(localTenantRepository.load());
      }
      setReady(true);
    })();
  }, [loadCloudDocs, loadUsage]);

  const mutateDocs = useCallback((fn: (d: DocRecord[]) => DocRecord[]) => {
    dirty.current = true;
    setSave({ state: "saving" });
    setDocs(fn);
  }, []);

  useEffect(() => {
    if (!ready || !dirty.current) return;
    const t = setTimeout(async () => {
      dirty.current = false;
      if (!cloud) {
        const ok = saveDocs(docs);
        setSave(ok ? { state: "saved", at: Date.now() } : { state: "error" });
        return;
      }
      const changed = docs.filter((d) => persisted.current.get(d.id) !== d && persisted.current.has(d.id));
      try {
        await Promise.all(
          changed.map(async (d) => {
            const r = await fetch(`/api/projects/${d.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: d.draft.title, draft: d.draft, plan: d.plan, images: d.images ?? [] }),
            });
            if (!r.ok) throw new Error(String(r.status));
            persisted.current.set(d.id, d);
          }),
        );
        setSave({ state: "saved", at: Date.now() });
      } catch {
        dirty.current = true; // 다음 변경 때 다시 시도
        setSave({ state: "error" });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [docs, ready, cloud]);

  const updateSettings = useCallback(
    (s: Settings) => {
      setSettings(s);
      if (!cloud) {
        if (!saveSettings(s)) notify("설정을 저장하지 못했습니다. 로고 파일 크기를 줄여 보세요.");
        return;
      }
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(async () => {
        const r = await fetch("/api/tenant", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: s }),
        }).catch(() => null);
        if (!r?.ok) notify("설정을 저장하지 못했습니다. 연결을 확인해 주세요.");
      }, 600);
    },
    [notify, cloud],
  );

  async function importLocal() {
    if (!cloud?.tenantId) return;
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docs: localImport.map((d) => ({
          title: d.draft.title,
          topic: d.topic,
          contentType: d.contentType,
          mock: d.mock,
          plan: d.plan,
          regionIndex: d.regionIndex ?? null,
          draft: d.draft,
          images: d.images ?? [],
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return notify(j?.error || "가져오지 못했습니다.");
    localStorage.setItem(`ebs:imported:${cloud.tenantId}`, "1");
    setLocalImport([]);
    await loadCloudDocs(cloud.tenantId);
    notify(`${(j.docs ?? []).length}개 글을 내 학원으로 가져왔습니다. 이 브라우저의 원본은 그대로 남아 있습니다.`);
  }

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
    async (docId: string, targets: ImageTarget[], draftOverride?: Draft, meta?: { topic: string; contentType: string }, auto = false): Promise<string | null> => {
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
            auto,
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
          body: JSON.stringify({
            scene: item.copy.scene || item.copy.title.join(" "),
            style: settings.image.illustrationStyle,
            note: settings.image.illustrationNote,
            composition: compositionFor(item.layout ?? autoLayout(item.kind, item.sectionIndex, settings.image, item.copy)),
            colors: [settings.image.primary, settings.image.accent].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)),
          }),
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
    [notify, patchImages, settings.image],
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
    if (busy) return; // 생성 중 다시 눌러도 중복 생성·차감하지 않는다
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
          requestId: newId(), // 시도마다 새 키: 같은 시도의 재전송만 중복 차감되지 않는다
        }),
      });
      if (res.status === 402) {
        setBusy(false);
        setQuotaHit(true);
        loadUsage();
        return;
      }
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
              id: ev.projectId ?? newId(),
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
            if (cloud && ev.projectId) persisted.current.set(doc.id, doc); // 서버가 이미 저장함
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

    let doc = created as DocRecord | null;
    if (doc && cloud && !persisted.current.has(doc.id)) {
      // 서버 저장이 실패했으면 한 번 더 저장을 시도한다(실패해도 글은 화면에 남는다)
      const local = doc;
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: [{ ...local, id: undefined, title: local.draft.title, regionIndex: local.regionIndex ?? null }] }),
      }).catch(() => null);
      const j = await r?.json().catch(() => ({}));
      const saved: DocRecord | undefined = j?.docs?.[0];
      if (r?.ok && saved) {
        persisted.current.set(saved.id, saved);
        setDocs((ds) => ds.map((x) => (x.id === local.id ? saved : x)));
        doc = saved;
      } else notify("글을 서버에 저장하지 못했습니다. 화면을 닫기 전에 다시 시도해 주세요.");
    }
    if (doc) {
      // 이미지 문구는 글이 저장된 뒤 만든다. 실패해도 글은 그대로 남는다.
      if (input.images) {
        setStages((s) => ({ ...s, images: "running" }));
        // 썸네일 + 글 성격에 맞게 고른 소주제 이미지(합계 2~5장)
        const err = await requestCopy(doc.id, allTargets(doc.draft), doc.draft, { topic: doc.topic, contentType: doc.contentType }, true);
        setStages((s) => ({ ...s, images: err ? "error" : "done" }));
        if (err) notify(`글은 저장되었습니다. 이미지는 편집 화면에서 다시 만들어 주세요. (${err})`);
      }
      setBusy(false);
      addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "success", docId: doc.id });
      if (cloud) loadUsage();
      setForm((f) => ({ ...f, topic: "" }));
      cache.current = {};
      setStages(IDLE);
      go({ name: "edit", id: doc.id });
    } else {
      setBusy(false);
      if (failedMsg) {
        setGenError(failedMsg);
        addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "error", message: failedMsg });
        if (cloud) loadUsage(); // 실패한 생성은 서버가 차감을 되돌린다
      }
    }
  }

  // 일러스트 API가 있으면 새로 만든 이미지에 일러스트를 차례로 붙인다(백그라운드)
  const autoIllustrated = useRef(new Set<string>());
  useEffect(() => {
    if (!api.illustration) return;
    for (const d of docs) {
      for (const it of d.images ?? []) {
        // 내용 정리 카드는 사진을 쓰지 않으므로 그림을 만들지 않는다(이미지 생성권 절약)
        if (it.illustration !== "none" || it.copy.visual === "card" || autoIllustrated.current.has(it.id) || Date.now() - d.createdAt > 10 * 60_000) continue;
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

  async function completeOnboarding(t: TenantProfile, phone: string) {
    const base = settings;
    const name = displayName(t);
    const oldName = tenant ? displayName(tenant) : "";
    const b = base.brand;
    // 비어 있거나 예전 학원명으로 자동 생성된 값만 새 학원명으로 채운다(사용자가 직접 바꾼 값은 유지)
    const auto = (cur: string, make: (n: string) => string) => (!cur || (oldName && cur === make(oldName)) ? make(name) : cur);
    const nextSettings: Settings = {
      ...base,
      brand: {
        ...b,
        name,
        author: auto(b.author, (n) => n),
        // {학원명} 템플릿: 학원 이름이 바뀌어도 출력할 때 현재 이름으로 채워진다
        greeting: auto(b.greeting, (n) => `안녕하세요! ${n}입니다.`) === `안녕하세요! ${name}입니다.` ? AUTO_GREETING : b.greeting,
        closingHeading: auto(b.closingHeading, (n) => `${n} 상담 안내`) === `${name} 상담 안내` ? AUTO_CLOSING : b.closingHeading,
        placePhone: phone,
      },
      image: {
        ...base.image,
        label: auto(base.image.label, (n) => n),
        // 썸네일 상단 상담 문구는 비어 있을 때만 대표 전화로 채운다(직접 쓴 문구는 유지)
        contact: base.image.contact || (phone ? `무료상담 ${phone}` : ""),
      },
    };
    if (cloud) {
      const r = await fetch("/api/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: t, settings: nextSettings }),
      }).catch(() => null);
      const j = await r?.json().catch(() => ({}));
      if (!r?.ok) {
        notify(j?.error || "학원 정보를 저장하지 못했습니다.");
        return;
      }
      setSettings(nextSettings);
      if (!cloud.tenantId) {
        setCloud({ ...cloud, tenantId: j.tenantId });
        await Promise.all([loadCloudDocs(j.tenantId), loadUsage()]);
      }
    } else {
      if (!localTenantRepository.save(t)) return notify("학원 정보를 저장하지 못했습니다. 브라우저 저장공간을 확인해 주세요.");
      updateSettings(nextSettings);
    }
    setTenant(t);
    notify(tenant?.onboardedAt ? "학원 정보를 저장했습니다" : "학원 정보를 등록했습니다. 첫 글을 만들어 보세요.");
    go({ name: "compose" });
  }

  const track = useCallback((type: string, plan?: string, kind?: string) => {
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, plan, kind }) }).catch(() => undefined);
  }, []);

  const buyPlan = (planId: string) =>
    runBuy(async () => {
      track("purchase_clicked", planId);
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      }).catch(() => null);
      const j = await r?.json().catch(() => ({}));
      if (!r?.ok || !j.checkoutUrl) return notify(j?.error || "결제를 시작하지 못했습니다.");
      window.location.href = j.checkoutUrl;
    });

  /** 사용자가 직접 확인한 발행 표시(네이버 공식 연동이 아니므로 자동 판정하지 않음) */
  async function confirmPublished(id: string, on: boolean) {
    const status = on ? "published_confirmed" : "draft";
    if (cloud) {
      const r = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).catch(() => null);
      if (!r?.ok) return notify("발행 표시를 저장하지 못했습니다.");
      const { doc: saved } = await r.json();
      persisted.current.set(id, saved);
      setDocs((ds) => ds.map((d) => (d.id === id ? saved : d)));
    } else {
      mutateDocs((ds) => ds.map((d) => (d.id === id ? { ...d, status, publishedAt: on ? Date.now() : null } : d)));
    }
    notify(on ? "발행 완료로 표시했습니다" : "발행 표시를 취소했습니다");
  }

  async function deleteDoc(id: string) {
    if (cloud) {
      const r = await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => null);
      if (!r?.ok) return notify("삭제하지 못했습니다.");
      persisted.current.delete(id);
    }
    const d = docs.find((x) => x.id === id);
    d?.images?.forEach((i) => idbDel(illustrationKey(i.id)));
    mutateDocs((ds) => ds.filter((x) => x.id !== id));
    notify("삭제했습니다");
  }

  // ---------- 렌더 ----------
  let view: React.ReactNode;
  if (!ready) {
    // 계정·학원 정보를 불러오는 동안 화면 자리를 먼저 보여 준다
    view = (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="불러오는 중">
        <div className="flex h-14 items-center border-b border-line px-5 md:px-8">
          <div className="skeleton h-5 w-40" />
        </div>
        <div className="mx-auto w-full max-w-[720px] space-y-4 px-5 py-10 md:px-8">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      </div>
    );
  } else if (needsOnboarding || route.name === "onboarding") {
    view = (
      <OnboardingView
        key={tenant?.onboardedAt ?? "new"}
        initial={tenant ?? (localSeed ? { ...localSeed, onboardedAt: null } : { ...EMPTY_TENANT, name: settings.brand.name })}
        phone={settings.brand.placePhone}
        editing={!!tenant?.onboardedAt}
        onComplete={completeOnboarding}
        onCancel={() => go({ name: "settings" })}
        notify={notify}
      />
    );
  } else if (route.name === "compose" && cloud && !busy && (quotaHit || (billing && contentLeft(billing.usage) === 0))) {
    view = <Paywall usage={billing?.usage ?? null} plans={billing?.plans ?? []} payment={billing?.payment} onBuy={buyPlan} onSeen={() => track("pricing_viewed")} />;
  } else if (route.name === "compose") {
    const u = billing?.usage;
    const left = contentLeft(u ?? null);
    view = (
      <ComposeView
        usageLabel={
          cloud && u?.plan
            ? u.plan.isTrial
              ? `무료 체험 ${left}회 남음`
              : u.content.limit === null
                ? `${u.plan.name} 이용 중`
                : `생성권 ${left}개 남음`
            : undefined
        }
        form={form}
        setForm={setForm}
        brand={settings.brand}
        contentTypes={vertical.contentTypes}
        topicPlaceholder={`예) ${vertical.exampleTopics[0]}`}
        exampleTopics={vertical.exampleTopics}
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
        onConfirmPublished={(on) => confirmPublished(doc.id, on)}
        track={cloud ? (type, kind) => track(type, undefined, kind) : undefined}
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
        {!ready ? (
          <div className="skeleton ml-auto h-8 w-20" aria-hidden />
        ) : cloud ? (
          <form action="/auth/signout" method="post" className="ml-auto">
            <button className="btn btn-sm gap-1.5" aria-label="로그아웃">
              <LogOut size={14} /> 로그아웃
            </button>
          </form>
        ) : (
          <a className="btn btn-sm btn-primary ml-auto gap-1.5" href="/login">
            <LogIn size={14} /> 로그인
          </a>
        )}
      </div>
      <aside className={`${menu ? "block" : "hidden"} absolute inset-x-0 top-12 z-40 border-b border-line shadow-md lg:static lg:block lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-none`}>
        <Sidebar
          route={route}
          count={docs.length}
          api={api}
          tenantName={tenant?.onboardedAt ? displayName(tenant) : ""}
          locked={needsOnboarding}
          ready={ready}
          email={cloud?.email ?? null}
          onNavigate={go}
          onRecheck={checkApi}
        />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {localImport.length > 0 && !needsOnboarding && route.name !== "onboarding" && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-bg2 px-5 py-2 text-[14px] md:px-8">
            <span className="flex-1">이 브라우저에 로그인 전에 만든 글 {localImport.length}개가 있습니다.</span>
            <button className="btn btn-sm" onClick={importLocal}>내 학원으로 가져오기</button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                if (cloud?.tenantId) localStorage.setItem(`ebs:imported:${cloud.tenantId}`, "1");
                setLocalImport([]);
              }}
            >
              가져오지 않기
            </button>
          </div>
        )}
        {view}
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-[14px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
