'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type CashOutQuoteDto, type TicketDto } from '@goalbet/shared';
import { Button, cn } from '@goalbet/ui';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { usePoll } from '@/lib/realtime';
import { useErrorMessage } from '@/lib/use-error-message';

/** F2.3 live offers for every open ticket; odds pushes for those matches refresh it (lib/realtime). */
export function useCashOutOffers(enabled: boolean) {
  const poll = usePoll(10_000);
  return useQuery({
    queryKey: ['cashout-offers'],
    queryFn: () => api<CashOutQuoteDto[]>('/cashout/offers'),
    enabled,
    refetchInterval: poll,
    select: (rows) => new Map(rows.map((r) => [r.ticketId, r])),
  });
}

/**
 * F2.4–F2.7 cash out on a ticket: show the offer, confirm, accept. When the price moved more
 * than 1 % the API returns the new offer and the player confirms again.
 */
export function CashOutBar({ ticket, quote }: { ticket: TicketDto; quote: CashOutQuoteDto | undefined }) {
  const t = useTranslations('bets.cashOutBar');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offer = quote?.available ? quote.offerBani : null;
  // the shown offer follows the live quote unless the player is confirming a specific amount
  useEffect(() => {
    if (offer === null) setConfirm(null);
  }, [offer]);

  if (!quote) return null;
  if (!quote.available) {
    if (quote.reason === 'NOT_OPEN' || quote.reason === 'DISABLED') return null;
    return (
      <p className="relative border-t border-line px-4 py-2.5 text-center text-xs text-ink-faint" data-testid="cashout-unavailable">
        {t('unavailable')} · {t(`reason.${quote.reason}`)}
      </p>
    );
  }

  const accept = async (amount: number) => {
    setBusy(true);
    setError(null);
    try {
      await api<TicketDto>(`/tickets/${ticket.id}/cashout`, {
        method: 'POST',
        body: { offerBani: amount },
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      });
      setConfirm(null);
      for (const k of ['tickets', 'ticket-counts', 'cashout-offers', 'wallet']) void qc.invalidateQueries({ queryKey: [k] });
      void qc.invalidateQueries({ queryKey: ['ticket', ticket.id] });
    } catch (err) {
      const latest = err instanceof ApiError ? err.details?.['offerBani'] : undefined;
      if (err instanceof ApiError && err.code === 'CASHOUT_PRICE_CHANGED' && typeof latest === 'number') {
        setConfirm(latest);
        setChanged(true);
      } else {
        setError(toMessage(err));
        setConfirm(null);
      }
      void qc.invalidateQueries({ queryKey: ['cashout-offers'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative border-t border-line px-4 py-3" data-testid="cashout-bar">
      <AnimatePresence mode="wait" initial={false}>
        {confirm === null ? (
          <motion.div key="offer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <Button
              className="w-full bg-boost text-boost-ink hover:bg-boost/90"
              onClick={() => {
                setChanged(false);
                setConfirm(offer);
              }}
              data-testid="cashout-button"
            >
              <HandCoins className="size-4" aria-hidden="true" />
              {t('button', { amount: f.ron(offer ?? 0) })}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-2">
            <p className={cn('text-center text-xs', changed ? 'font-semibold text-boost' : 'text-ink-muted')} role="status">
              {changed ? t('changed', { amount: f.ron(confirm) }) : t('question', { amount: f.ron(confirm), stake: f.ron(ticket.stakeBani) })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button className="bg-boost text-boost-ink hover:bg-boost/90" onClick={() => accept(confirm)} loading={busy} data-testid="cashout-confirm">
                {t('confirm', { amount: f.ron(confirm) })}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error ? (
        <p className="mt-2 text-center text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
