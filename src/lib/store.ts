// 브라우저(localStorage) 기반 문서·이력 저장소. 서버 DB(Phase 5) 도입 전까지 사용한다.
import type { ImageCopy, ImageKind } from "./imageCopy";
import type { Draft, Plan } from "./schemas";
import type { ImageLayout } from "./settings";
import type { PublishStatus, QualityIssue } from "./quality";

export interface Quality {
  status: PublishStatus;
  issues: QualityIssue[];
  charCount: number;
}

export interface ImageItem {
  id: string;
  kind: ImageKind;
  sectionIndex: number | null;
  copy: ImageCopy;
  layout?: ImageLayout; // 없으면 블로그 설정의 기본 레이아웃
  illustration: "none" | "ready";
  updatedAt: number;
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
  images?: ImageItem[];
  status?: "draft" | "published_confirmed"; // 발행 완료는 사용자가 직접 확인한 표시(공식 연동 아님)
  publishedAt?: number | null;
  // 아래 3개는 이전 버전 호환용(현재는 화면에서 바로 계산)
  plainText?: string;
  html?: string;
  quality?: Quality;
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

/** 썸네일 → 소주제 순서로 정렬 */
export function sortImages(items: ImageItem[] = []) {
  return [...items].sort((a, b) => (a.kind === b.kind ? (a.sectionIndex ?? 0) - (b.sectionIndex ?? 0) : a.kind === "thumbnail" ? -1 : 1));
}

export function imageLabel(it: ImageItem) {
  return it.kind === "thumbnail" ? "썸네일" : `소주제 ${(it.sectionIndex ?? 0) + 1}`;
}

export function imagePosition(it: ImageItem) {
  return it.kind === "thumbnail" ? "본문 맨 위" : `소주제 ${(it.sectionIndex ?? 0) + 1} 제목 아래`;
}

export const STATUS_LABEL: Record<PublishStatus, string> = {
  READY: "발행 준비 완료",
  NEEDS_REVIEW: "검토 필요",
  FAILED: "수정 필요",
};
