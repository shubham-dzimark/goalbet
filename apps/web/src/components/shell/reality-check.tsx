'use client';

import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type Page, type WalletTransactionDto } from '@goalbet/shared';
import { Button, Dialog, DialogContent } from '@goalbet/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useFormat } from '@/lib/format';

const START_KEY = 'gb-session-start';
const RETURN_TYPES = new Set(['WIN', 'CASHOUT', 'REFUND']);

function sessionStart(): number {
  try {
    const v = Number(sessionStorage.getItem(START_KEY));
    if (v > 0) return v;
    const now = Date.now();
    sessionStorage.setItem(START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

/**
 * Responsible gambling reality check: every N minutes (the player's choice in My account →
 * Preferences) a reminder shows how long they have been playing and what they staked and got
 * back since logging in, with a quick way to stop or set limits.
 */
export function RealityCheck() {
  const t = useTranslations('realityCheck');
  const f = useFormat();
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const minutes = user?.realityCheckMinutes ?? null;
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<{ played: number; staked: number; returned: number } | null>(null);

  useEffect(() => {
    if (!minutes) return;
    const start = sessionStart();
    const every = minutes * 60_000;
    let next = start + Math.ceil((Date.now() - start + 1) / every) * every;
    const timer = setInterval(async () => {
      if (Date.now() < next) return;
      next += every;
      const tx = await api<Page<WalletTransactionDto>>('/wallet/transactions?limit=100').catch(() => null);
      const since = (tx?.items ?? []).filter((x) => new Date(x.createdAt).getTime() >= start);
      setSummary({
        played: Math.round((Date.now() - start) / 60_000),
        staked: since.filter((x) => x.type === 'STAKE').reduce((a, x) => a - x.amountBani, 0),
        returned: since.filter((x) => RETURN_TYPES.has(x.type)).reduce((a, x) => a + x.amountBani, 0),
      });
      setOpen(true);
    }, 15_000);
    return () => clearInterval(timer);
  }, [minutes]);

  if (!user || !summary) return null;
  const net = summary.returned - summary.staked;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={t('title')} description={t('played', { minutes: summary.played })} closeLabel={t('continue')} className="max-w-md">
        <div className="space-y-4" data-testid="reality-check">
          <div className="flex items-center gap-3 rounded-2xl bg-tint/[0.05] p-4 ring-1 ring-line">
            <Clock className="size-8 shrink-0 text-brand" aria-hidden="true" />
            <dl className="grid flex-1 grid-cols-3 gap-2 text-center text-xs text-ink-muted">
              <div>
                <dt>{t('staked')}</dt>
                <dd className="font-display text-lg font-bold text-ink">{f.ron(summary.staked)}</dd>
              </div>
              <div>
                <dt>{t('returned')}</dt>
                <dd className="font-display text-lg font-bold text-ink">{f.ron(summary.returned)}</dd>
              </div>
              <div>
                <dt>{t('net')}</dt>
                <dd className={`font-display text-lg font-bold ${net < 0 ? 'text-danger' : 'text-brand'}`}>{f.ron(net)}</dd>
              </div>
            </dl>
          </div>
          <p className="text-sm text-ink-muted">{t('hint')}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={() => setOpen(false)} data-testid="reality-continue">
              {t('continue')}
            </Button>
            <Button asChild variant="outline" onClick={() => setOpen(false)}>
              <Link href="/account?tab=limits">{t('limits')}</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                void api('/auth/logout', { method: 'POST' })
                  .catch(() => undefined)
                  .then(() => {
                    useAuth.getState().clear();
                    router.push('/');
                  });
              }}
            >
              {t('logout')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
