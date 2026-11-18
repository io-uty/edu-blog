"use client";

import { FileText, History, Settings2, SquarePen } from "lucide-react";
import Logo from "./Logo";
import type { Route } from "./Studio";

export interface ApiState {
  checked: boolean;
  mock: boolean;
  model: string | null;
  ok: boolean;
  illustration: boolean;
  message?: string;
}

const ITEMS: { name: Route["name"]; label: string; icon: typeof FileText }[] = [
  { name: "compose", label: "새 콘텐츠 작성", icon: SquarePen },
  { name: "list", label: "콘텐츠 목록", icon: FileText },
  { name: "history", label: "생성 이력", icon: History },
  { name: "settings", label: "블로그 설정", icon: Settings2 },
];

export default function Sidebar({
  route,
  count,
  api,
  tenantName,
  locked,
  email,
  onNavigate,
  onRecheck,
}: {
  route: Route;
  count: number;
  api: ApiState;
  tenantName: string;
  locked: boolean;
  email: string | null;
  onNavigate: (r: Route) => void;
  onRecheck: () => void;
}) {
  // 편집/발행 화면에서는 '콘텐츠 목록'을 현재 위치로 표시
  const current = route.name === "edit" || route.name === "publish" ? "list" : route.name === "onboarding" ? "settings" : route.name;

  let apiLine = "확인 중…";
  let apiTone = "text-sub";
  if (api.checked) {
    if (api.mock) {
      apiLine = "API 키 미설정 · 샘플 모드";
      apiTone = "text-warn";
    } else if (api.ok) {
      apiLine = `API 연결됨 · ${api.model}`;
      apiTone = "text-ok";
    } else {
      apiLine = "API 연결 실패";
      apiTone = "text-err";
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="hidden border-b border-line px-5 py-4 lg:block">
        <Logo />
        {tenantName && <p className="mt-2 truncate text-xs text-sub" title={tenantName}>{tenantName}</p>}
      </div>
      <nav className="flex-1 space-y-0.5 p-3" aria-label="주 메뉴">
        {ITEMS.map(({ name, label, icon: Icon }) => (
          <button
            key={name}
            className="nav-item"
            aria-current={current === name ? "page" : undefined}
            disabled={locked}
            onClick={() => onNavigate({ name } as Route)}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            {name === "list" && count > 0 && <span className="text-xs text-sub">{count}</span>}
          </button>
        ))}
      </nav>
      {email && (
        <form action="/auth/signout" method="post" className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs">
          <span className="flex-1 truncate text-sub" title={email}>{email}</span>
          <button className="text-sub underline underline-offset-2 hover:text-ink">로그아웃</button>
        </form>
      )}
      <div className="border-t border-line px-5 py-3 text-xs">
        <p className={apiTone}>{apiLine}</p>
        {api.checked && !api.ok && api.message && <p className="mt-1 leading-5 text-sub">{api.message}</p>}
        {api.checked && (api.mock || !api.ok) && (
          <button className="mt-1 underline underline-offset-2 text-sub hover:text-ink" onClick={onRecheck}>
            다시 확인
          </button>
        )}
      </div>
    </div>
  );
}
