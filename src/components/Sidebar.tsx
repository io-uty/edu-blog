"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, FileText, History, LogIn, LogOut, Plus, Settings2, SquarePen } from "lucide-react";
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
  ready,
  email,
  tenants,
  currentTenantId,
  onSwitchTenant,
  onAddTenant,
  onNavigate,
  onRecheck,
}: {
  route: Route;
  count: number;
  api: ApiState;
  tenantName: string;
  locked: boolean;
  ready: boolean;
  email: string | null;
  tenants: { id: string; name: string }[];
  currentTenantId: string | null;
  onSwitchTenant: (id: string) => void;
  onAddTenant: () => void;
  onNavigate: (r: Route) => void;
  onRecheck: () => void;
}) {
  // 왼쪽 아래 계정 메뉴: 학원 전환·학원 추가·로그아웃
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const current = tenants.find((t) => t.id === currentTenantId);

  // 편집/발행 화면에서는 '콘텐츠 목록'을 현재 위치로 표시
  const here = route.name === "edit" || route.name === "publish" ? "list" : route.name === "onboarding" ? "settings" : route.name;

  let apiLine = "확인 중…";
  let apiTone = "text-sub";
  if (api.checked) {
    if (api.mock) {
      apiLine = "샘플 모드(AI 미연결)";
      apiTone = "text-warn";
    } else if (api.ok) {
      apiLine = "AI 연결됨";
      apiTone = "text-ok";
    } else {
      apiLine = "AI 연결 안 됨";
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
            aria-current={here === name ? "page" : undefined}
            disabled={locked}
            onClick={() => onNavigate({ name } as Route)}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
            {name === "list" && count > 0 && <span className="text-xs text-sub">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="border-t border-line px-4 py-3">
        {!ready ? (
          <div className="skeleton h-10" aria-hidden />
        ) : email ? (
          <div ref={box} className="relative">
            <button
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-bg2"
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpen((o) => !o)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{current?.name || "학원 등록 전"}</span>
                <span className="block truncate text-xs text-sub" title={email}>{email}</span>
              </span>
              <ChevronsUpDown size={15} className="shrink-0 text-sub" />
            </button>
            {open && (
              <div className="absolute inset-x-0 bottom-full z-50 mb-2 rounded-2xl border border-line bg-white p-1.5 shadow-lg">
                {tenants.length > 0 && (
                  <>
                    <p className="px-2.5 pb-1 pt-1.5 text-xs text-sub">내 학원</p>
                    <ul className="max-h-60 overflow-y-auto">
                      {tenants.map((t) => (
                        <li key={t.id}>
                          <button
                            className="nav-item"
                            aria-current={t.id === currentTenantId ? "true" : undefined}
                            onClick={() => {
                              setOpen(false);
                              onSwitchTenant(t.id);
                            }}
                          >
                            <span className="flex-1 truncate">{t.name}</span>
                            {t.id === currentTenantId && <Check size={15} className="shrink-0" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="nav-item"
                      onClick={() => {
                        setOpen(false);
                        onAddTenant();
                      }}
                    >
                      <Plus size={15} /> 학원 추가
                    </button>
                    <div className="my-1 border-t border-line" />
                  </>
                )}
                <form action="/auth/signout" method="post">
                  <button className="nav-item">
                    <LogOut size={15} /> 로그아웃
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <a className="btn btn-primary h-10 w-full justify-center gap-2 text-[14px]" href="/login">
            <LogIn size={15} /> 로그인
          </a>
        )}
      </div>
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
