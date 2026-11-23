import type { ReactNode } from "react";
import { Check } from "lucide-react";

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
      <div className="min-w-[160px] flex-1">
        <h1 className="truncate text-[17px] font-semibold">{title}</h1>
        {sub && <p className="truncate text-xs text-sub">{sub}</p>}
      </div>
      {status && <div className="hidden text-xs text-sub sm:block">{status}</div>}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

const FLOW = ["주제 입력", "내용 확인·수정", "네이버에 올리기"];

/** 지금 어느 단계인지 보여주는 흐름 표시줄 */
export function StepBar({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-bg2 px-5 py-2 text-[13px] md:px-8" aria-label="작업 단계">
      {FLOW.map((label, i) => (
        <li key={label} className="flex items-center gap-2 whitespace-nowrap">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              i < current ? "bg-ok text-white" : i === current ? "bg-brand text-white" : "border border-line bg-white text-sub"
            }`}
          >
            {i < current ? <Check size={13} /> : i + 1}
          </span>
          <span className={i === current ? "font-semibold text-ink" : "hidden text-sub sm:inline"}>{label}</span>
          {i < FLOW.length - 1 && <span className="mx-1 h-px w-4 bg-line sm:w-6 md:w-10" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
