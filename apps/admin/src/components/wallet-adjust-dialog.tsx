'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, Field, Input, cn } from '@goalbet/ui';
import { useErrorText } from '@/lib/data';
import { parseRon, useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';
import { toast } from './ui/feedback';

type Result = { status: 'APPLIED'; balanceBani: number } | { status: 'PENDING_APPROVAL'; approvalId: string };

/**
 * F3.3 add / remove RON credit with a mandatory reason. Amounts above the approval threshold
 * are queued for a second admin instead of being applied.
 */
export function WalletAdjustDialog({
  open,
  onOpenChange,
  user,
  initialType = 'ADMIN_CREDIT',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: { id: string; name: string; email: string; balanceBani: number };
  initialType?: 'ADMIN_CREDIT' | 'ADMIN_DEBIT';
}) {
  const t = useTranslations('wallet.adjust');
  const tc = useTranslations('common2');
  const f = useFmt();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType(initialType);
      setAmount('');
      setReason('');
      setError(null);
    }
  }, [open, initialType]);

  const bani = parseRon(amount);
  const after = bani ? user.balanceBani + (type === 'ADMIN_CREDIT' ? bani : -bani) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bani) return setError(t('amountInvalid'));
    if (reason.trim().length < 3) return setError(tc('reasonRequired'));
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi<Result>(`/admin/users/${user.id}/wallet`, { method: 'POST', body: { type, amountBani: bani, reason: reason.trim() } });
      toast.success(res.status === 'APPLIED' ? t('applied', { balance: f.ron(res.balanceBani) }) : t('queued'));
      await Promise.all(['user', 'users', 'transactions', 'approvals', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} description={t('description', { name: user.name, email: user.email })} closeLabel={tc('close')}>
        <form onSubmit={submit} className="space-y-4" data-testid="wallet-adjust-form">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-tint/[0.05] p-1 ring-1 ring-line" role="radiogroup" aria-label={t('type')}>
            {(['ADMIN_CREDIT', 'ADMIN_DEBIT'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={type === k}
                onClick={() => setType(k)}
                className={cn(
                  'rounded-lg py-2 text-sm font-bold text-ink-muted transition-colors',
                  type === k && (k === 'ADMIN_CREDIT' ? 'bg-brand text-brand-ink' : 'bg-danger text-white'),
                )}
              >
                {t(k === 'ADMIN_CREDIT' ? 'credit' : 'debit')}
              </button>
            ))}
          </div>
          <Field label={t('amount')} htmlFor="adjust-amount" hint={after !== null ? t('balanceAfter', { from: f.ron(user.balanceBani), to: f.ron(after) }) : t('balanceNow', { balance: f.ron(user.balanceBani) })}>
            <div className="relative">
              <Input id="adjust-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} className="pr-14 text-right font-display tracking-tight text-xl font-semibold" autoFocus data-testid="adjust-amount" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">RON</span>
            </div>
          </Field>
          <Field label={tc('reason')} htmlFor="adjust-reason" hint={tc('reasonHint')}>
            <textarea
              id="adjust-reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-[var(--radius-control)] border border-line bg-tint/[0.04] px-3 py-2 text-sm text-ink focus:border-brand/60 focus:outline-none"
              data-testid="adjust-reason"
            />
          </Field>
          {after !== null && after < 0 ? <Alert tone="warning">{t('negative')}</Alert> : null}
          {error ? <Alert>{error}</Alert> : null}
          <p className="text-xs text-ink-faint">{t('approvalNote')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={busy} variant={type === 'ADMIN_CREDIT' ? 'primary' : 'danger'} data-testid="adjust-submit">
              {t(type === 'ADMIN_CREDIT' ? 'submitCredit' : 'submitDebit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
