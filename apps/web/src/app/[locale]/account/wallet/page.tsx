'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, Hourglass, Info, type LucideIcon, RotateCcw, Ticket, Trophy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { type Page, WALLET_TX_TYPES, type WalletTransactionDto, type WalletTxType, formatRon } from '@goalbet/shared';
import { Button, EmptyState, Input, Skeleton, cn } from '@goalbet/ui';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { Reveal } from '@/components/fx/reveal';
import { PageTitle } from '@/components/sport/event-list';
import { DepositDialog, PaymentRequestsList, WithdrawDialog, usePaymentInfo } from '@/components/wallet/payment-requests';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';

const TX_ICON: Record<WalletTxType, { icon: LucideIcon; tone: string }> = {
  ADMIN_CREDIT: { icon: ArrowDownLeft, tone: 'bg-brand/15 text-brand' },
  ADMIN_DEBIT: { icon: ArrowUpRight, tone: 'bg-danger/15 text-danger' },
  STAKE: { icon: Ticket, tone: 'bg-tint/10 text-ink' },
  WIN: { icon: Trophy, tone: 'bg-brand/15 text-brand' },
  CASHOUT: { icon: Banknote, tone: 'bg-boost/15 text-boost' },
  REFUND: { icon: RotateCcw, tone: 'bg-accent/15 text-accent' },
  VOID_REVERSAL: { icon: RotateCcw, tone: 'bg-danger/15 text-danger' },
  DEPOSIT: { icon: ArrowDownLeft, tone: 'bg-brand/15 text-brand' },
  WITHDRAWAL: { icon: ArrowUpRight, tone: 'bg-accent/15 text-accent' },
};

interface Filters {
  type: string;
  from: string;
  to: string;
}

/** F1.8 — RON balance and transaction history with type / date filters. */
export default function WalletPage() {
  const t = useTranslations();
  const f = useFormat();
  const locale = useLocale() as 'ro' | 'en';
  const authed = useRequireAuth();
  const [draft, setDraft] = useState<Filters>({ type: '', from: '', to: '' });
  const [filters, setFilters] = useState<Filters>(draft);
  const [dialog, setDialog] = useState<'deposit' | 'withdraw' | null>(null);
  const info = usePaymentInfo(authed);

  const balance = useQuery({ queryKey: ['wallet'], queryFn: () => api<{ balanceBani: number }>('/wallet'), enabled: authed, refetchInterval: 15_000 });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const list = useInfiniteQuery({
    queryKey: ['wallet-tx', qs],
    queryFn: ({ pageParam }) => api<Page<WalletTransactionDto>>(`/wallet/transactions?limit=30${qs ? `&${qs}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: authed,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const sum = (types: WalletTxType[]) => rows.filter((r) => types.includes(r.type)).reduce((a, r) => a + Math.abs(r.amountBani), 0);

  const setType = (type: string) => {
    const next = { ...draft, type };
    setDraft(next);
    setFilters(next);
  };
  const apply = (e: FormEvent) => {
    e.preventDefault();
    setFilters(draft);
  };

  return (
    <div className="space-y-6">
      <PageTitle sub={t('account.title')}>{t('wallet.title')}</PageTitle>

      <section className="relative overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong p-6 sm:p-8">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(34rem_18rem_at_100%_0%,rgb(var(--brand-rgb)/0.18),transparent_60%),radial-gradient(30rem_16rem_at_0%_100%,rgb(var(--gold-rgb)/0.12),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">{t('wallet.balance')}</p>
            {balance.data ? (
              <AnimatedNumber
                value={balance.data.balanceBani}
                format={(n) => formatRon(n, locale)}
                className="mt-1 block font-display text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl"
                testId="wallet-balance"
                duration={1.2}
              />
            ) : (
              <Skeleton className="mt-2 h-14 w-64" />
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { label: t('txType.DEPOSIT'), value: sum(['DEPOSIT', 'ADMIN_CREDIT', 'REFUND']), tone: 'text-brand' },
              { label: t('txType.STAKE'), value: sum(['STAKE']), tone: 'text-ink' },
              { label: t('txType.WIN'), value: sum(['WIN', 'CASHOUT']), tone: 'text-boost' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-tint/[0.05] px-4 py-3 ring-1 ring-line">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">{s.label}</p>
                <p className={cn('font-display tracking-tight text-lg font-semibold tabular-nums', s.tone)}>{f.ron(s.value)}</p>
              </div>
            ))}
          </div>
        </div>
        {info.data && info.data.heldBani > 0 ? (
          <p className="relative mt-4 flex items-center gap-2 text-sm text-ink-muted" data-testid="wallet-held">
            <Hourglass className="size-4 text-accent" aria-hidden="true" />
            {t('payments.heldLine', { held: f.ron(info.data.heldBani), available: f.ron(info.data.availableBani) })}
          </p>
        ) : null}
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => setDialog('deposit')} disabled={!info.data || info.data.methods.length === 0 || info.data.depositBlocked} data-testid="deposit-btn">
            <ArrowDownLeft aria-hidden="true" />
            {t('payments.deposit.button')}
          </Button>
          <Button variant="secondary" onClick={() => setDialog('withdraw')} disabled={!info.data || info.data.methods.length === 0} data-testid="withdraw-btn">
            <ArrowUpRight aria-hidden="true" />
            {t('payments.withdraw.button')}
          </Button>
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-ink-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            {info.data?.depositBlocked ? t('payments.depositBlocked') : t('payments.note')}
          </p>
        </div>
      </section>

      {info.data ? (
        <>
          <DepositDialog open={dialog === 'deposit'} onOpenChange={(o) => setDialog(o ? 'deposit' : null)} info={info.data} />
          <WithdrawDialog open={dialog === 'withdraw'} onOpenChange={(o) => setDialog(o ? 'withdraw' : null)} info={info.data} />
        </>
      ) : null}

      <PaymentRequestsList enabled={authed} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display tracking-tight text-2xl font-semibold">{t('wallet.history')}</h2>
          <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
            <Input type="date" aria-label={t('wallet.from')} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="h-10 w-40" />
            <Input type="date" aria-label={t('wallet.to')} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="h-10 w-40" />
            <Button type="submit" variant="secondary" size="sm" className="h-10">
              {t('wallet.apply')}
            </Button>
          </form>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label={t('wallet.type')}>
          {['', ...WALLET_TX_TYPES].map((ty) => (
            <button
              key={ty || 'all'}
              type="button"
              role="tab"
              aria-selected={filters.type === ty}
              onClick={() => setType(ty)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition-colors',
                filters.type === ty ? 'bg-ink text-surface ring-ink' : 'bg-tint/[0.04] text-ink-muted ring-line hover:text-ink',
              )}
            >
              {ty ? t(`txType.${ty}`) : t('wallet.allTypes')}
            </button>
          ))}
        </div>

        {!authed || list.isPending ? (
          <Skeleton className="h-60 rounded-3xl" />
        ) : rows.length === 0 ? (
          <div className="glass rounded-[var(--radius-card)]">
            <EmptyState title={t('wallet.empty')} />
          </div>
        ) : (
          <div className="glass rounded-[var(--radius-card)] p-2" data-testid="wallet-table">
            <Reveal className="divide-y divide-line" deps={[qs, rows.length]} stagger={0.025}>
              {rows.map((r) => {
                const { icon: Icon, tone } = TX_ICON[r.type];
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-3" data-testid="wallet-row" data-type={r.type}>
                    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t(`txType.${r.type}`)}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {f.dateTime(r.createdAt)} ·{' '}
                        {r.ticketId ? (
                          <Link href={`/my-bets/${r.ticketId}`} className="font-mono text-accent hover:underline">
                            {r.ticketCode}
                          </Link>
                        ) : (
                          r.reason
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn('font-display tracking-tight text-lg font-semibold tabular-nums', r.amountBani > 0 ? 'text-brand' : 'text-ink')}>
                        {r.amountBani > 0 ? '+' : ''}
                        {f.ron(r.amountBani)}
                      </p>
                      <p className="text-[11px] tabular-nums text-ink-faint">{f.ron(r.balanceAfterBani)}</p>
                    </div>
                  </div>
                );
              })}
            </Reveal>
            {list.hasNextPage ? (
              <div className="p-2">
                <Button variant="outline" className="w-full" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                  {t('wallet.loadMore')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
