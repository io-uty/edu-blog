// 브라우저(localStorage) 기반 문서·이력 저장소. 서버 DB(Phase 5) 도입 전까지 사용한다.
import type { Draft, Plan } from "./schemas";
import type { PublishStatus, QualityIssue } from "./quality";

export interface Quality {
  status: PublishStatus;
  issues: QualityIssue[];
  charCount: number;
}

export interface DocRecord {
  id: string;
  title: string;
  topic: string;
  contentType: string;
  mock: boolean;
  plan: Plan;
  regionIndex: number;
  draft: Draft;
  plainText: string;
  html: string;
  quality: Quality;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  topic: string;
  contentType: string;
  mock: boolean;
  outcome: "success" | "error";
  docId?: string;
  message?: string;
}

const DOCS_KEY = "ebs:docs:v1";
const HIST_KEY = "ebs:history:v1";

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

/** 저장 성공 여부를 반환한다(용량 초과 등 실패 시 false). */
function write(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export const loadDocs = () => read<DocRecord>(DOCS_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
export const saveDocs = (docs: DocRecord[]) => write(DOCS_KEY, docs);
export const loadHistory = () => read<HistoryEntry>(HIST_KEY).sort((a, b) => b.at - a.at);
export const saveHistory = (h: HistoryEntry[]) => write(HIST_KEY, h.slice(0, 200));

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

export function formatTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const STATUS_LABEL: Record<PublishStatus, string> = {
  READY: "발행 준비 완료",
  NEEDS_REVIEW: "검토 필요",
  FAILED: "수정 필요",
};
