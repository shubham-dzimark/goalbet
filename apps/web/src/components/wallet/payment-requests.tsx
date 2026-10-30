'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Building2, Check, Copy, Hourglass, Store, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type Page, type PaymentInfoDto, type PaymentMethod, type PaymentRequestDto, isValidIban, parseRonToBani } from '@goalbet/shared';
import { Alert, Badge, Button, Dialog, DialogContent, Field, Input, Skeleton, cn } from '@goalbet/ui';
import { ApiError, api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;
const METHOD_ICON = { BANK_TRANSFER: Building2, CASH_AT_SHOP: Store } as const;

export function usePaymentInfo(enabled: boolean) {
  return useQuery({ queryKey: ['payment-info'], queryFn: () => api<PaymentInfoDto>('/wallet/payment-info'), enabled });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all(['payment-info', 'payment-requests', 'wallet'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const t = useTranslations('payments');
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-tint/[0.04] px-3 py-2 ring-1 ring-line">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="truncate font-mono text-sm font-bold">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value.replace(/\s/g, ''));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {t(copied ? 'copied' : 'copy')}
      </button>
    </div>
  );
}

function MethodPicker({ methods, value, onChange }: { methods: PaymentMethod[]; value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const t = useTranslations('payments.methods');
  return (
    <div role="radiogroup" aria-label={t('label')} className="grid gap-2 sm:grid-cols-2">
      {methods.map((m) => {
        const Icon = METHOD_ICON[m];
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            onClick={() => onChange(m)}
            className={cn(
              'flex items-start gap-3 rounded-xl p-3 text-left ring-1 transition-colors',
              value === m ? 'bg-brand-soft ring-brand' : 'bg-tint/[0.03] ring-line hover:ring-line-strong',
            )}
            data-testid={`method-${m}`}
          >
            <Icon className={cn('mt-0.5 size-5 shrink-0', value === m ? 'text-brand' : 'text-ink-muted')} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">{t(m)}</span>
              <span className="block text-xs text-ink-muted">{t(`${m}_help`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Deposit: amount + method → a reference code and where to pay; Finance credits it once received. */
export function DepositDialog({ open, onOpenChange, info }: { open: boolean; onOpenChange: (v: boolean) => void; info: PaymentInfoDto }) {
  const t = useTranslations('payments');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const refresh = useRefresh();
  const [method, setMethod] = useState<PaymentMethod>(info.methods[0] ?? 'BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [payerReference, setPayerReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PaymentRequestDto | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setPayerReference('');
      setError(null);
      setDone(null);
      setMethod(info.methods[0] ?? 'BANK_TRANSFER');
    }
  }, [open, info.methods]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bani = parseRonToBani(amount);
    if (!bani || bani < info.limits.minDepositBani || bani > info.limits.maxDepositBani) {
      return setError(t('limits', { min: f.ron(info.limits.minDepositBani), max: f.ron(info.limits.maxDepositBani) }));
    }
    setBusy(true);
    setError(null);
    try {
      setDone(await api<PaymentRequestDto>('/wallet/requests', { method: 'POST', body: { type: 'DEPOSIT', method, amountBani: bani, ...(payerReference ? { payerReference } : {}) } }));
      void refresh();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('deposit.title')} description={done ? t('deposit.doneHelp') : t('deposit.help')} closeLabel={t('close')} className="max-w-lg">
        {done ? (
          <div className="space-y-3" data-testid="deposit-done">
            <Alert tone="success">{t('deposit.done', { amount: f.ron(done.amountBani) })}</Alert>
            <CopyValue label={t('reference')} value={done.reference} />
            {done.method === 'BANK_TRANSFER' ? (
              <>
                <CopyValue label={t('bank.iban')} value={info.bank.iban.replace(/(.{4})/g, '$1 ').trim()} />
                <CopyValue label={t('bank.beneficiary')} value={info.bank.beneficiary} />
                <p className="text-xs text-ink-muted">{t('bank.instructions', { bank: info.bank.bankName })}</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t('shop.depositInstructions')}</p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>{t('ok')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="deposit-form">
            <MethodPicker methods={info.methods} value={method} onChange={setMethod} />
            <Field label={t('amount')} htmlFor="dep-amount" hint={t('limits', { min: f.ron(info.limits.minDepositBani), max: f.ron(info.limits.maxDepositBani) })}>
              <div className="relative">
                <Input id="dep-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="pr-14 text-right font-display tracking-tight text-xl font-semibold" autoFocus data-testid="dep-amount" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">RON</span>
              </div>
            </Field>
            {method === 'BANK_TRANSFER' ? (
              <Field label={t('deposit.payerReference')} htmlFor="dep-ref" hint={t('deposit.payerReferenceHelp')}>
                <Input id="dep-ref" value={payerReference} onChange={(e) => setPayerReference(e.target.value)} maxLength={60} />
              </Field>
            ) : null}
            {error ? <Alert>{error}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={busy} data-testid="dep-submit">
                {t('deposit.submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Withdrawal: amount (held at once) + where to pay; Finance pays out and confirms. */
export function WithdrawDialog({ open, onOpenChange, info }: { open: boolean; onOpenChange: (v: boolean) => void; info: PaymentInfoDto }) {
  const t = useTranslations('payments');
  const tv = useTranslations('validation');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const refresh = useRefresh();
  const [method, setMethod] = useState<PaymentMethod>(info.methods[0] ?? 'BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState('');
  const [errors, setErrors] = useState<{ form?: string; iban?: string; holder?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PaymentRequestDto | null>(null);
  const max = Math.min(info.availableBani, info.limits.maxWithdrawalBani);

  useEffect(() => {
    if (open) {
      setAmount('');
      setErrors({});
      setDone(null);
      setMethod(info.methods[0] ?? 'BANK_TRANSFER');
    }
  }, [open, info.methods]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bani = parseRonToBani(amount);
    const next: typeof errors = {};
    if (!bani || bani < info.limits.minWithdrawalBani || bani > max) next.form = t('withdraw.range', { min: f.ron(info.limits.minWithdrawalBani), max: f.ron(max) });
    if (method === 'BANK_TRANSFER') {
      if (!isValidIban(iban)) next.iban = tv('iban');
      if (holder.trim().length < 3) next.holder = tv('holder');
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !bani) return;
    setBusy(true);
    try {
      setDone(
        await api<PaymentRequestDto>('/wallet/requests', {
          method: 'POST',
          body: { type: 'WITHDRAWAL', method, amountBani: bani, ...(method === 'BANK_TRANSFER' ? { iban, accountHolder: holder.trim() } : {}) },
        }),
      );
      void refresh();
    } catch (err) {
      const fields = err instanceof ApiError ? (err.details?.['fields'] as Record<string, string> | undefined) : undefined;
      setErrors({ form: toMessage(err), ...(fields?.['iban'] ? { iban: tv('iban') } : {}) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('withdraw.title')} description={done ? undefined : t('withdraw.help')} closeLabel={t('close')} className="max-w-lg">
        {done ? (
          <div className="space-y-3" data-testid="withdraw-done">
            <Alert tone="success">{t('withdraw.done', { amount: f.ron(done.amountBani) })}</Alert>
            <CopyValue label={t('reference')} value={done.reference} />
            <p className="text-sm text-ink-muted">{t(done.method === 'BANK_TRANSFER' ? 'withdraw.bankNext' : 'shop.withdrawInstructions')}</p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>{t('ok')}</Button>
            </div>
          </div>
        ) : info.pendingWithdrawal ? (
          <Alert tone="info">{t('withdraw.alreadyPending')}</Alert>
        ) : max < info.limits.minWithdrawalBani ? (
          <div className="space-y-3" data-testid="withdraw-too-low">
            <Alert tone="info">{t('withdraw.tooLow', { min: f.ron(info.limits.minWithdrawalBani), available: f.ron(info.availableBani) })}</Alert>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('close')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="withdraw-form">
            <div className="flex items-baseline justify-between rounded-xl bg-tint/[0.04] px-3 py-2 ring-1 ring-line">
              <span className="text-sm text-ink-muted">{t('available')}</span>
              <span className="font-display tracking-tight text-xl font-semibold tabular-nums">{f.ron(info.availableBani)}</span>
            </div>
            <MethodPicker methods={info.methods} value={method} onChange={setMethod} />
            <Field label={t('amount')} htmlFor="wd-amount" hint={t('withdraw.range', { min: f.ron(info.limits.minWithdrawalBani), max: f.ron(max) })}>
              <div className="relative">
                <Input id="wd-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="pr-14 text-right font-display tracking-tight text-xl font-semibold" autoFocus data-testid="wd-amount" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">RON</span>
              </div>
            </Field>
            {method === 'BANK_TRANSFER' ? (
              <>
                <Field label={t('withdraw.iban')} htmlFor="wd-iban" error={errors.iban}>
                  <Input id="wd-iban" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="RO49 AAAA 1B31 0075 9384 0000" className="font-mono" autoComplete="off" data-testid="wd-iban" />
                </Field>
                <Field label={t('withdraw.holder')} htmlFor="wd-holder" error={errors.holder}>
                  <Input id="wd-holder" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} autoComplete="name" data-testid="wd-holder" />
                </Field>
              </>
            ) : null}
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <Hourglass className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {t('withdraw.holdNote')}
            </p>
            {errors.form ? <Alert>{errors.form}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" loading={busy} data-testid="wd-submit">
                {t('withdraw.submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The player's own deposit / withdrawal requests, with cancel while pending. */
export function PaymentRequestsList({ enabled }: { enabled: boolean }) {
  const t = useTranslations('payments');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const refresh = useRefresh();
  const [error, setError] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['payment-requests'],
    queryFn: ({ pageParam }) => api<Page<PaymentRequestDto>>(`/wallet/requests?limit=10${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const cancel = async (id: string) => {
    setError(null);
    try {
      await api(`/wallet/requests/${id}/cancel`, { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(toMessage(err));
    }
  };

  if (list.isLoading) return <Skeleton className="h-24 rounded-2xl" />;
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3" data-testid="payment-requests">
      <h2 className="font-display tracking-tight text-2xl font-semibold">{t('requests')}</h2>
      {error ? <Alert>{error}</Alert> : null}
      <ul className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
        {rows.map((r) => {
          const deposit = r.type === 'DEPOSIT';
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', deposit ? 'bg-brand/15 text-brand' : 'bg-accent/15 text-accent')}>
                {deposit ? <ArrowDownLeft className="size-4" aria-hidden="true" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {t(deposit ? 'deposit.label' : 'withdraw.label')} · <span className="font-mono">{r.reference}</span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {t(`methods.${r.method}`)}
                  {r.details.iban ? ` · ${r.details.iban}` : ''} · {f.dateTime(r.createdAt)}
                </p>
                {r.status === 'REJECTED' && r.decisionNote ? <p className="mt-0.5 text-xs text-danger">{t('rejectedBecause', { note: r.decisionNote })}</p> : null}
                {r.awaitingSecondApproval ? <p className="mt-0.5 text-xs text-ink-faint">{t('secondApproval')}</p> : null}
              </div>
              <div className="text-right">
                <p className={cn('font-display tracking-tight text-lg font-semibold tabular-nums', deposit ? 'text-brand' : '')}>
                  {deposit ? '+' : '−'}
                  {f.ron(r.amountBani)}
                </p>
                <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
              </div>
              {r.status === 'PENDING' ? (
                <Button size="sm" variant="ghost" onClick={() => void cancel(r.id)} aria-label={t('cancelRequest')}>
                  <X aria-hidden="true" />
                  {t('cancelRequest')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.hasNextPage ? (
        <div className="text-center">
          <Button size="sm" variant="ghost" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
            {t('more')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
