import type { ReactNode } from "react";

export function PageHeader({
  title,
  sub,
  status,
  actions,
}: {
  title: string;
  sub?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-[56px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-5 py-2 md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold">{title}</h1>
        {sub && <p className="truncate text-xs text-sub">{sub}</p>}
      </div>
      {status && <div className="text-xs text-sub">{status}</div>}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
