"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import type { ContentType } from "@/config/brand";
import type { Analysis, Draft, Plan } from "@/lib/schemas";
import {
  loadDocs,
  loadHistory,
  newId,
  saveDocs,
  saveHistory,
  type DocRecord,
  type HistoryEntry,
  type Quality,
} from "@/lib/store";
import ComposeView, { type Form, type StageState } from "./ComposeView";
import EditorView, { type SaveState } from "./EditorView";
import { BrandView, HistoryView, ListView } from "./Pages";
import PublishView from "./PublishView";
import Sidebar, { type ApiState } from "./Sidebar";

export type Route =
  | { name: "compose" }
  | { name: "list" }
  | { name: "history" }
  | { name: "brand" }
  | { name: "edit"; id: string }
  | { name: "publish"; id: string };

function parseHash(h: string): Route {
  const [name, id] = h.replace(/^#\/?/, "").split("/");
  if (name === "list" || name === "history" || name === "brand") return { name };
  if ((name === "edit" || name === "publish") && id) return { name, id };
  return { name: "compose" };
}
const toHash = (r: Route) => "#/" + ("id" in r ? `${r.name}/${r.id}` : r.name);

const IDLE: StageState = { analysis: "idle", plan: "idle", draft: "idle" };

export default function Studio() {
  const [route, setRoute] = useState<Route>({ name: "compose" });
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [api, setApi] = useState<ApiState>({ checked: false, mock: false, model: null, ok: false });
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [save, setSave] = useState<SaveState>({ state: "idle" });

  const [form, setForm] = useState<Form>({ topic: "", contentType: "편입영어", regionIndex: null });
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageState>(IDLE);
  const [genError, setGenError] = useState<string | null>(null);
  const cache = useRef<{ analysis?: Analysis; plan?: Plan }>({});

  const dirty = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rerenderTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  // ---------- 라우팅 ----------
  const go = useCallback((r: Route) => {
    setMenu(false);
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
      setApi({ checked: true, mock: !!j.mock, model: j.model ?? null, ok: !!j.ok, message: j.message });
    } catch {
      setApi({ checked: true, mock: false, model: null, ok: false, message: "서버에 연결하지 못했습니다." });
    }
  }, []);
  useEffect(() => {
    checkApi();
  }, [checkApi]);

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
    let created: string | null = null;
    let wasMock = api.mock;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: input.topic,
          contentType: input.contentType,
          regionIndex: input.regionIndex,
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
            const doc: DocRecord = {
              id: newId(),
              title: ev.draft.title,
              topic: input.topic,
              contentType: input.contentType,
              mock: !!ev.mock,
              plan: ev.plan,
              regionIndex: ev.regionIndex,
              draft: ev.draft,
              plainText: ev.plainText,
              html: ev.html,
              quality: ev.quality,
              createdAt: now,
              updatedAt: now,
            };
            mutateDocs((d) => [doc, ...d]);
            created = doc.id;
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
    } finally {
      setBusy(false);
    }

    if (created) {
      addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "success", docId: created });
      setForm((f) => ({ ...f, topic: "" }));
      cache.current = {};
      setStages(IDLE);
      go({ name: "edit", id: created });
    } else if (failedMsg) {
      setGenError(failedMsg);
      addHistory({ topic: input.topic, contentType: input.contentType, mock: wasMock, outcome: "error", message: failedMsg });
    }
  }

  // ---------- 편집 / 재검사 ----------
  const rerender = useCallback(
    async (id: string, draft: Draft) => {
      try {
        const r = await fetch("/api/rerender", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        if (!r.ok) return;
        const j = (await r.json()) as { plainText: string; html: string; quality: Quality };
        // 그 사이 사용자가 더 수정했다면 오래된 결과는 버린다
        mutateDocs((ds) => ds.map((d) => (d.id === id && d.draft === draft ? { ...d, ...j } : d)));
      } catch {
        /* 재검사 실패는 편집을 막지 않는다 */
      }
    },
    [mutateDocs],
  );

  const onDraftChange = useCallback(
    (id: string, draft: Draft) => {
      mutateDocs((ds) => ds.map((d) => (d.id === id ? { ...d, draft, title: draft.title, updatedAt: Date.now() } : d)));
      clearTimeout(rerenderTimer.current);
      rerenderTimer.current = setTimeout(() => rerender(id, draft), 500);
    },
    [mutateDocs, rerender],
  );

  const doc = "id" in route ? docs.find((d) => d.id === route.id) : undefined;

  // 발행 준비 진입 시 최신 상태로 한 번 더 재검사
  const publishId = route.name === "publish" ? route.id : null;
  useEffect(() => {
    if (!ready || !publishId) return;
    const d = docs.find((x) => x.id === publishId);
    if (d) rerender(d.id, d.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishId, ready]);

  function deleteDoc(id: string) {
    mutateDocs((ds) => ds.filter((d) => d.id !== id));
    notify("삭제했습니다");
  }

  // ---------- 렌더 ----------
  let view: React.ReactNode;
  if (!ready) {
    view = null;
  } else if (route.name === "compose") {
    view = (
      <ComposeView
        form={form}
        setForm={setForm}
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
  } else if (route.name === "brand") {
    view = <BrandView />;
  } else if (!doc) {
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
        save={save}
        aiEnabled={api.checked && api.ok && !doc.mock}
        onChange={(d) => onDraftChange(doc.id, d)}
        onPublish={() => go({ name: "publish", id: doc.id })}
      />
    );
  } else {
    view = <PublishView doc={doc} onBack={() => go({ name: "edit", id: doc.id })} notify={notify} />;
  }

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 lg:hidden">
        <button className="btn btn-sm" onClick={() => setMenu((m) => !m)} aria-label="메뉴" aria-expanded={menu}>
          <Menu size={16} />
        </button>
        <span className="text-[13px] font-semibold">강남 블로그 스튜디오</span>
      </div>
      <aside className={`${menu ? "block" : "hidden"} absolute inset-x-0 top-12 z-40 border-b border-line shadow-md lg:static lg:block lg:w-[220px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-none`}>
        <Sidebar route={route} count={docs.length} api={api} onNavigate={go} onRecheck={checkApi} />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{view}</main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 bg-ink px-4 py-2 text-[13px] text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

export type { ContentType };
