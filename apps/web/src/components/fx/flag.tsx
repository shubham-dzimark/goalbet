import { cn } from '@goalbet/ui';

/** Small inline SVG flags for the competitions we carry (emoji flags do not render on Windows). */
export function Flag({ code, className }: { code: string; className?: string }) {
  const c = cn('h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-tint/15', className);
  switch (code) {
    case 'RO':
      return (
        <svg viewBox="0 0 3 2" className={c} aria-hidden="true">
          <rect width="1" height="2" fill="#002b7f" />
          <rect x="1" width="1" height="2" fill="#fcd116" />
          <rect x="2" width="1" height="2" fill="#ce1126" />
        </svg>
      );
    case 'GB':
      return (
        <svg viewBox="0 0 5 3" className={c} aria-hidden="true">
          <rect width="5" height="3" fill="#fff" />
          <rect x="2.1" width="0.8" height="3" fill="#ce1124" />
          <rect y="1.1" width="5" height="0.8" fill="#ce1124" />
        </svg>
      );
    case 'ES':
      return (
        <svg viewBox="0 0 3 2" className={c} aria-hidden="true">
          <rect width="3" height="2" fill="#aa151b" />
          <rect y="0.5" width="3" height="1" fill="#f1bf00" />
        </svg>
      );
    case 'IT':
      return (
        <svg viewBox="0 0 3 2" className={c} aria-hidden="true">
          <rect width="1" height="2" fill="#009246" />
          <rect x="1" width="1" height="2" fill="#fff" />
          <rect x="2" width="1" height="2" fill="#ce2b37" />
        </svg>
      );
    case 'DE':
      return (
        <svg viewBox="0 0 5 3" className={c} aria-hidden="true">
          <rect width="5" height="1" fill="#000" />
          <rect y="1" width="5" height="1" fill="#dd0000" />
          <rect y="2" width="5" height="1" fill="#ffce00" />
        </svg>
      );
    case 'FR':
      return (
        <svg viewBox="0 0 3 2" className={c} aria-hidden="true">
          <rect width="1" height="2" fill="#002395" />
          <rect x="1" width="1" height="2" fill="#fff" />
          <rect x="2" width="1" height="2" fill="#ed2939" />
        </svg>
      );
    case 'EU':
      return (
        <svg viewBox="0 0 30 20" className={c} aria-hidden="true">
          <rect width="30" height="20" fill="#003399" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            // rounded so server and browser render identical attributes (hydration)
            const r3 = (n: number) => Math.round(n * 1000) / 1000;
            return <circle key={i} cx={r3(15 + Math.cos(a) * 6)} cy={r3(10 + Math.sin(a) * 6)} r="0.9" fill="#ffcc00" />;
          })}
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 3 2" className={c} aria-hidden="true">
          <rect width="3" height="2" fill="#334155" />
          <circle cx="1.5" cy="1" r="0.55" fill="none" stroke="#94a3b8" strokeWidth="0.12" />
        </svg>
      );
  }
}
