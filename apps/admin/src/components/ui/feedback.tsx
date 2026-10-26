'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { create } from 'zustand';
import { Alert, Button, Dialog, DialogContent, Field, cn } from '@goalbet/ui';
import { useErrorText } from '@/lib/data';

// ── toasts ──
interface Toast {
  id: number;
  tone: 'success' | 'error';
  text: string;
}
const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), 4_000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (text: string) => useToasts.getState().push({ tone: 'success', text }),
  error: (text: string) => useToasts.getState().push({ tone: 'error', text }),
};

export function Toaster() {
  const { items, drop } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => drop(t.id)}
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-card-solid p-3 text-left text-sm shadow-[var(--shadow-float)] [animation:gb-toast_.25s_ease-out]',
            t.tone === 'success' ? 'border-brand/40' : 'border-danger/40',
          )}
          data-testid={`toast-${t.tone}`}
        >
          {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />}
          {t.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Confirmation that needs a written reason (every audited operator action carries one).
 * `onConfirm` receives the reason; errors are shown inline and the dialog stays open.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const t = useTranslations('common2');
  const errorText = useErrorText();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError(t('reasonRequired'));
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} closeLabel={t('close')}>
        <form onSubmit={submit} className="space-y-4">
          {children}
          <Field label={t('reason')} htmlFor="reason-input" hint={t('reasonHint')}>
            <textarea
              id="reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              autoFocus
              className="w-full rounded-[var(--radius-control)] border border-line bg-tint/[0.04] px-3 py-2 text-sm text-ink focus:border-brand/60 focus:outline-none"
              data-testid="reason-input"
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={busy} variant={tone === 'danger' ? 'danger' : 'primary'} data-testid="reason-confirm">
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
