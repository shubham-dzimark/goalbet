import { cn } from '../lib/cn';
import { brand } from '../brand/brand';

/**
 * Betuno brand images, served from each app's /public/brand. The wordmark comes in two versions:
 * white "BET" for dark surfaces and black "BET" for light ones; CSS in tokens.css shows the one that
 * matches the surrounding data-theme.
 */
const ICON = '/brand/betuno-icon.webp';
const ON_DARK = '/brand/betuno-wordmark-on-dark.webp';
const ON_LIGHT = '/brand/betuno-wordmark-on-light.webp';

/** Square "B" app icon. Size it with h-/w- or size- classes. */
export function LogoMark({ className }: { className?: string }) {
  return <img src={ICON} alt="" width={128} height={128} decoding="async" className={cn('h-8 w-8 shrink-0 rounded-[22%]', className)} aria-hidden="true" />;
}

/** Full Betuno wordmark (icon + name), optionally followed by a small label such as "Admin". */
export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img src={ON_DARK} alt={brand.name} width={433} height={96} decoding="async" className="logo-on-dark h-8 w-auto" />
      <img src={ON_LIGHT} alt={brand.name} width={421} height={96} decoding="async" className="logo-on-light h-8 w-auto" />
      {suffix ? <span className="text-sm font-semibold text-ink-muted">{suffix}</span> : null}
    </span>
  );
}
