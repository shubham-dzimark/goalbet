'use client';

import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { type CompetitionDto, type EventSummaryDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { TeamCrest } from '@/components/fx/team-crest';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat, useMatchClock } from '@/lib/format';
import { gsap, prefersReducedMotion } from '@/lib/gsap';

/** ⌘K / Ctrl+K command palette: instant search over teams and competitions. */
export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('search');
  const f = useFormat();
  const clock = useMatchClock();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open && panel.current && !prefersReducedMotion()) {
      gsap.fromTo(panel.current, { y: -16, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.35 });
    }
    if (!open) setQ('');
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api<{ competitions: CompetitionDto[]; events: EventSummaryDto[] }>(`/catalog/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const items: { key: string; href: string; node: React.ReactNode }[] = [
    ...(data?.competitions ?? []).map((c) => ({
      key: c.id,
      href: `/sport/${c.id}`,
      node: (
        <span className="flex items-center gap-3">
          <Flag code={c.countryCode} />
          <span className="font-semibold">{c.name}</span>
        </span>
      ),
    })),
    ...(data?.events ?? []).map((e) => ({
      key: e.id,
      href: `/match/${e.id}`,
      node: (
        <span className="flex w-full items-center gap-3">
          <TeamCrest name={e.homeTeam} size={24} />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {e.homeTeam} <span className="text-ink-faint">–</span> {e.awayTeam}
            <span className="block truncate text-xs font-normal text-ink-faint">{e.competition.name}</span>
          </span>
          <span className={cn('text-xs font-bold', e.status === 'LIVE' ? 'text-live' : 'text-ink-muted')}>
            {e.status === 'LIVE' ? `${e.homeScore}:${e.awayScore} · ${clock(e)}` : f.kickoff(e.startTime)}
          </span>
        </span>
      ),
    })),
  ];

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md" />
        <DialogPrimitive.Content
          ref={panel}
          className="fixed left-1/2 top-[12vh] z-[61] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border border-line-strong bg-card-solid shadow-[var(--shadow-float)]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIndex((i) => Math.min(items.length - 1, i + 1));
            if (e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
            if (e.key === 'Enter' && items[index]) go(items[index].href);
          }}
        >
          <DialogPrimitive.Title className="sr-only">{t('title')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('placeholder')}</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-5 text-brand" aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIndex(0);
              }}
              placeholder={t('placeholder')}
              className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
              data-testid="command-search-input"
            />
            <DialogPrimitive.Close className="rounded-lg p-1 text-ink-muted hover:bg-tint/10" aria-label={t('close')}>
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {debounced.length < 2 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">{t('hint')}</p>
            ) : items.length === 0 && !isFetching ? (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">{t('empty')}</p>
            ) : (
              <ul role="listbox">
                {items.map((it, i) => (
                  <li key={it.key} role="option" aria-selected={i === index}>
                    <button
                      type="button"
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => go(it.href)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                        i === index ? 'bg-tint/[0.07] ring-1 ring-brand/30' : 'hover:bg-tint/[0.04]',
                      )}
                    >
                      {it.node}
                      {i === index ? <CornerDownLeft className="size-4 shrink-0 text-ink-faint" aria-hidden="true" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
