'use client';

import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { combineOdds } from '@goalbet/shared';
import { Dialog, SheetContent } from '@goalbet/ui';
import { useFormat } from '@/lib/format';
import { useSlip } from '@/lib/slip-store';
import { BetSlip } from './bet-slip';

/** Mobile bet slip: floating bar above the bottom nav that opens a bottom sheet (F1.12). */
export function MobileSlip() {
  const t = useTranslations('slip');
  const f = useFormat();
  const { items, sheetOpen, setSheetOpen, mode } = useSlip();
  const odds = items.length > 0 ? combineOdds(items.map((i) => i.oddsMilli)) : 1000;

  return (
    <div className="xl:hidden">
      {items.length > 0 && !sheetOpen ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-3 bottom-[4.5rem] z-40 flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-brand-ink shadow-xl md:bottom-4 md:left-auto md:right-4 md:w-80"
          data-testid="mobile-slip-bar"
        >
          <span className="flex items-center gap-2 font-bold">
            <span className="flex size-6 items-center justify-center rounded-full bg-white/20 text-sm">{items.length}</span>
            {t('open')}
          </span>
          <span className="flex items-center gap-1 font-bold tabular-nums">
            {mode === 'acca' ? f.odds(odds) : t('selections', { count: items.length })}
            <ChevronUp className="size-4" aria-hidden="true" />
          </span>
        </button>
      ) : null}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent title={t('title')}>
          <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <BetSlip />
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );
}
