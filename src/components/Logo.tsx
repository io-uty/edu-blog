/** 딸깍 워드마크 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="딸깍">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="8" fill="var(--color-brand)" />
        <path d="M8 6.5v10.2l2.6-2.4 1.7 3.6 1.9-.9-1.7-3.5H16z" fill="#fff" />
      </svg>
      <span className="text-[20px] font-extrabold leading-none tracking-[-0.03em]">딸깍</span>
    </span>
  );
}
