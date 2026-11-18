/** bbolog 워드마크 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="bbolog">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="0" y="0" width="22" height="22" rx="3" fill="var(--color-brand)" />
        <path d="M6 4.5v13h5.2a3.7 3.7 0 0 0 0-7.4H6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span className="text-[19px] font-extrabold leading-none tracking-[-0.03em]">bbolog</span>
    </span>
  );
}
