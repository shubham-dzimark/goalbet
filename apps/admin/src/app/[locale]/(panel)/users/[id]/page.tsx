'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Mail, MinusCircle, Pencil, Phone, PlusCircle, ShieldOff } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type AdminUserDetail, USER_LIMIT_TYPES } from '@goalbet/shared';
import { Alert, Button, Dialog, DialogContent, Field, Input, NativeSelect, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@goalbet/ui';
import { AuditTable } from '@/components/audit-table';
import { TicketsTable } from '@/components/tickets-table';
import { TransactionsTable } from '@/components/transactions-table';
import { UserStatusBadge } from '@/components/ui/badges';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { DetailList, Panel, StatCard } from '@/components/ui/page';
import { WalletAdjustDialog } from '@/components/wallet-adjust-dialog';
import { Link } from '@/i18n/navigation';
import { useCan, useErrorText } from '@/lib/data';
import { parseRon, useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';

/** F3.2 player page: profile, money, bets, limits and full history; edit / credit / suspend. */
export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('users');
  const f = useFmt();
  const can = useCan();
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery({ queryKey: ['user', id], queryFn: () => adminApi<AdminUserDetail>(`/admin/users/${id}`) });
  const [adjust, setAdjust] = useState<'ADMIN_CREDIT' | 'ADMIN_DEBIT' | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  const suspended = user.status === 'SUSPENDED';
  const changeStatus = async (reason: string) => {
    const next = await adminApi<AdminUserDetail>(`/admin/users/${id}/status`, { method: 'POST', body: { status: suspended ? 'ACTIVE' : 'SUSPENDED', reason } });
    qc.setQueryData(['user', id], next);
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
    toast.success(t(suspended ? 'activated' : 'suspended'));
  };

  return (
    <>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>

      {/* header */}
      <section className="glass relative mb-6 overflow-hidden rounded-[var(--radius-card)] p-5 sm:p-6" data-testid="user-header">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(40rem_16rem_at_0%_0%,rgb(var(--brand-rgb)/0.12),transparent_60%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-lg font-bold text-brand-ink">
              {user.name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-3xl font-bold uppercase italic leading-none">{user.name}</h1>
                <UserStatusBadge status={user.status} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                <span className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden="true" />{user.email}</span>
                <span className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden="true" />{user.phone}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t('balance')}</p>
            <p className="font-display text-4xl font-bold tabular-nums text-brand" data-testid="user-balance">{f.ron(user.balanceBani)}</p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2">
          {can('FINANCE') ? (
            <>
              <Button size="sm" onClick={() => setAdjust('ADMIN_CREDIT')} data-testid="credit-btn">
                <PlusCircle aria-hidden="true" />
                {t('addCredit')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdjust('ADMIN_DEBIT')}>
                <MinusCircle aria-hidden="true" />
                {t('removeCredit')}
              </Button>
            </>
          ) : null}
          {can('OPERATOR') ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" />
                {t('edit')}
              </Button>
              <Button size="sm" variant={suspended ? 'secondary' : 'danger'} onClick={() => setStatusOpen(true)} data-testid="status-btn">
                {suspended ? <CheckCircle2 aria-hidden="true" /> : <Ban aria-hidden="true" />}
                {t(suspended ? 'activate' : 'suspend')}
              </Button>
            </>
          ) : null}
        </div>
      </section>

      {user.selfExclusion ? (
        <Alert tone="warning" className="mb-4 flex items-center gap-2">
          <ShieldOff className="size-4 shrink-0" aria-hidden="true" />
          {user.selfExclusion.endsAt ? t('excludedUntil', { date: f.date(user.selfExclusion.endsAt) }) : t('excludedForever')}
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          {(['overview', 'wallet', 'bets', 'limits', 'history'] as const).map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {t(`tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('stats.tickets')} value={f.num(user.stats.tickets)} hint={t('stats.wonLost', { won: user.stats.won, lost: user.stats.lost })} />
            <StatCard label={t('stats.staked')} value={f.ron(user.stats.totalStakedBani)} />
            <StatCard label={t('stats.returned')} value={f.ron(user.stats.totalReturnedBani)} />
            <StatCard label={t('stats.open')} value={f.ron(user.stats.openStakeBani)} hint={t('stats.openTickets', { count: user.openTickets })} tone="gold" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t('profile')}>
              <DetailList
                rows={[
                  { label: t('fields.dob'), value: f.date(`${user.dateOfBirth}T12:00:00Z`) },
                  { label: t('fields.locale'), value: user.locale.toUpperCase() },
                  { label: t('fields.oddsPref'), value: t(`oddsPref.${user.oddsChangePreference}`) },
                  { label: t('fields.joined'), value: f.dateTime(user.createdAt) },
                  { label: t('fields.lastLogin'), value: user.lastLoginAt ? f.dateTime(user.lastLoginAt) : '—' },
                ]}
              />
            </Panel>
            <Panel title={t('rejections')}>
              {user.recentRejections.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noRejections')}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {user.recentRejections.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-mono text-xs">{r.code}</span>
                      <span className="text-xs text-ink-faint">{f.dateTime(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="wallet">
          <TransactionsTable userId={user.id} testId="user-transactions" />
        </TabsContent>
        <TabsContent value="bets">
          <TicketsTable params={{ userId: user.id }} showPlayer={false} testId="user-tickets" />
        </TabsContent>
        <TabsContent value="limits">
          <LimitsTab user={user} canEdit={can('OPERATOR')} />
        </TabsContent>
        <TabsContent value="history">
          <AuditTable params={{ entityId: user.id }} testId="user-history" />
        </TabsContent>
      </Tabs>

      {adjust ? <WalletAdjustDialog open onOpenChange={(o) => !o && setAdjust(null)} user={user} initialType={adjust} /> : null}
      <ReasonDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title={t(suspended ? 'activateTitle' : 'suspendTitle', { name: user.name })}
        description={t(suspended ? 'activateHelp' : 'suspendHelp')}
        confirmLabel={t(suspended ? 'activate' : 'suspend')}
        tone={suspended ? 'primary' : 'danger'}
        onConfirm={changeStatus}
      />
      <EditDialog open={editOpen} onOpenChange={setEditOpen} user={user} />
    </>
  );
}

function EditDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (v: boolean) => void; user: AdminUserDetail }) {
  const t = useTranslations('users');
  const tc = useTranslations('common2');
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [locale, setLocale] = useState(user.locale);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(user.name);
      setPhone(user.phone);
      setLocale(user.locale);
      setError(null);
    }
  }, [open, user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...(name !== user.name ? { name } : {}), ...(phone !== user.phone ? { phone } : {}), ...(locale !== user.locale ? { locale } : {}) };
    if (Object.keys(body).length === 0) return onOpenChange(false);
    setBusy(true);
    setError(null);
    try {
      const next = await adminApi<AdminUserDetail>(`/admin/users/${user.id}`, { method: 'PATCH', body });
      qc.setQueryData(['user', user.id], next);
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('saved'));
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('editTitle')} description={user.email} closeLabel={tc('close')}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('fields.name')} htmlFor="edit-name">
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('fields.phone')} htmlFor="edit-phone">
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label={t('fields.locale')} htmlFor="edit-locale">
            <NativeSelect id="edit-locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="ro">Română</option>
              <option value="en">English</option>
            </NativeSelect>
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {tc('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Player limits (own + operator). Operators can set or lift an operator limit, effective at once. */
function LimitsTab({ user, canEdit }: { user: AdminUserDetail; canEdit: boolean }) {
  const t = useTranslations('users.limits');
  const f = useFmt();
  const qc = useQueryClient();
  const [type, setType] = useState<string>(USER_LIMIT_TYPES[0]!);
  const [amount, setAmount] = useState('');
  const [dialog, setDialog] = useState<{ type: string; amountBani: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (reason: string) => {
    if (!dialog) return;
    const next = await adminApi<AdminUserDetail>(`/admin/users/${user.id}/limits`, { method: 'PUT', body: { ...dialog, reason } });
    qc.setQueryData(['user', user.id], next);
    toast.success(t(dialog.amountBani === null ? 'removed' : 'set'));
    setAmount('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel title={t('current')} bodyClassName="p-0">
        {user.limits.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">{t('none')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {user.limits.map((l) => (
              <li key={`${l.type}-${l.source}`} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`limit-${l.type}-${l.source}`}>
                <div>
                  <p className="text-sm font-semibold">{t(`types.${l.type}`)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                    {t(`source.${l.source}`)}
                    {l.pendingAmountBani !== null ? ` · ${t('pending', { amount: f.ron(l.pendingAmountBani), date: f.dateTime(l.effectiveAt) })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold tabular-nums">{f.ron(l.amountBani)}</span>
                  {canEdit && l.source === 'ADMIN' ? (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ type: l.type, amountBani: null })}>
                      {t('lift')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {canEdit ? (
        <Panel title={t('setTitle')}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const bani = parseRon(amount);
              if (!bani) return setError(t('invalid'));
              setError(null);
              setDialog({ type, amountBani: bani });
            }}
          >
            <Field label={t('type')} htmlFor="limit-type">
              <NativeSelect id="limit-type" value={type} onChange={(e) => setType(e.target.value)}>
                {USER_LIMIT_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(`types.${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('amount')} htmlFor="limit-amount" error={error ?? undefined} hint={t('help')}>
              <Input id="limit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" />
            </Field>
            <Button type="submit" className="w-full">
              {t('apply')}
            </Button>
          </form>
        </Panel>
      ) : null}
      <ReasonDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.amountBani === null ? t('liftTitle') : t('confirmTitle')}
        description={dialog ? `${t(`types.${dialog.type}`)}${dialog.amountBani !== null ? ` · ${f.ron(dialog.amountBani)}` : ''}` : undefined}
        confirmLabel={dialog?.amountBani === null ? t('lift') : t('apply')}
        onConfirm={save}
      />
    </div>
  );
}
