'use client';

import { useTranslations } from 'next-intl';
import { Dialog, SheetContent } from '@goalbet/ui';
import { useSlip } from '@/lib/slip-store';
import { BetSlip } from './bet-slip';

/** Below the xl breakpoint the slip opens as a bottom sheet from the tab bar's slip button. */
export function MobileSlip() {
  const t = useTranslations('slip');
  const { sheetOpen, setSheetOpen } = useSlip();
  return (
    <div className="xl:hidden">
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent title={t('title')}>
          <div className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
            <BetSlip />
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );
}
