'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronRight, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, type FormEvent, useEffect, useState } from 'react';
import { USER_LIMIT_TYPES, type UserLimitType, type WalletTransactionDto, parseRonToBani } from '@goalbet/shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Skeleton, cn } from '@goalbet/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PageTitle } from '@/components/sport/event-list';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { type SessionUser, useAuth } from '@/lib/auth-store';
import { useFormat } from '@/lib/format';
import { useErrorMessage, useFieldError } from '@/lib/use-error-message';
import { useRequireAuth } from '@/lib/use-require-auth';

interface LimitRow {
  type: UserLimitType;
  source: 'USER' | 'ADMIN';
  amountBani: number | null;
  pendingAmountBani: number | null;
  pendingRemoval: boolean;
  effectiveAt: string;
}

interface Dashboard {
  user: SessionUser;
  openTickets: number;
  openStakeBani: number;
  openPotentialWinBani: number;
  recentTransactions: WalletTransactionDto[];
  limits: LimitRow[];
  selfExclusion: { endsAt: string | null } | null;
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg bg-card-alt p-3">
      <p className="text-xs uppercase text-ink-muted">{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function ProfileCard({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const fe = useFieldError();
  const toMessage = useErrorMessage();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api<SessionUser>('/me', { method: 'PATCH', body: { name, phone } }),
    onSuccess: (u) => {
      useAuth.getState().setUser(u);
      setMsg({ ok: true, text: t('account.saved') });
    },
    onError: (e) => setMsg({ ok: false, text: toMessage(e) }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.profile')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            save.mutate();
          }}
        >
          <Field label={t('auth.name')} htmlFor="p-name">
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('auth.phone')} htmlFor="p-phone">
            <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t('auth.email')} htmlFor="p-email">
            <Input id="p-email" value={user.email} disabled />
          </Field>
          <Field label={t('auth.dateOfBirth')} htmlFor="p-dob">
            <Input id="p-dob" value={user.dateOfBirth} disabled />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              {t('account.save')}
            </Button>
            {msg ? <span className={cn('text-sm', msg.ok ? 'text-success' : 'text-danger')}>{fe(msg.text)}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const update = async (oddsChangePreference: string) => {
    const u = await api<SessionUser>('/me', { method: 'PATCH', body: { oddsChangePreference } });
    useAuth.getState().setUser(u);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.preferences')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('account.language')}</p>
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
        </div>
        <label className="space-y-1.5 text-sm font-medium">
          {t('slip.oddsPref')}
          <NativeSelect value={user.oddsChangePreference} onChange={(e) => void update(e.target.value)}>
            {(['NONE', 'HIGHER', 'ANY'] as const).map((p) => (
              <option key={p} value={p}>
                {t(`slip.pref${p}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
      </CardContent>
    </Card>
  );
}

function LimitsCard({ limits }: { limits: LimitRow[] }) {
  const t = useTranslations();
  const f = useFormat();
  const toMessage = useErrorMessage();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const own = (type: UserLimitType) => limits.find((l) => l.type === type && l.source === 'USER');

  const set = async (type: UserLimitType, amountBani: number | null) => {
    setError(null);
    try {
      await api('/me/limits', { method: 'PUT', body: { type, amountBani } });
      setValues((v) => ({ ...v, [type]: '' }));
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setError(toMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand" aria-hidden="true" />
          {t('account.limits')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-muted">{t('account.limitsHint')}</p>
        {error ? <Alert>{error}</Alert> : null}
        {USER_LIMIT_TYPES.map((type) => {
          const l = own(type);
          return (
            <form
              key={type}
              className="grid items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_140px_auto_auto]"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const bani = parseRonToBani(values[type] ?? '');
                if (bani) void set(type, bani);
              }}
            >
              <div>
                <p className="text-sm font-semibold">{t(`account.limitTypes.${type}`)}</p>
                <p className="text-xs text-ink-muted" data-testid={`limit-${type}`}>
                  {l?.amountBani ? f.ron(l.amountBani) : t('account.noLimit')}
                  {l?.pendingAmountBani ? ` · ${t('account.pendingLimit', { amount: f.ron(l.pendingAmountBani), date: f.dateTime(l.effectiveAt) })}` : ''}
                  {l?.pendingRemoval ? ` · ${t('account.pendingRemoval', { date: f.dateTime(l.effectiveAt) })}` : ''}
                </p>
              </div>
              <Input
                inputMode="decimal"
                aria-label={t('account.amountRon')}
                placeholder="RON"
                value={values[type] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [type]: e.target.value }))}
              />
              <Button type="submit" variant="secondary" size="md">
                {t('account.set')}
              </Button>
              <Button type="button" variant="ghost" size="md" disabled={!l?.amountBani} onClick={() => void set(type, null)}>
                {t('account.remove')}
              </Button>
            </form>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ExclusionCard({ exclusion }: { exclusion: Dashboard['selfExclusion'] }) {
  const t = useTranslations('account');
  const f = useFormat();
  const qc = useQueryClient();
  const [days, setDays] = useState<string>('7');
  const [confirm, setConfirm] = useState(false);
  const run = useMutation({
    mutationFn: () => api('/me/self-exclusion', { method: 'POST', body: { days: days === 'permanent' ? null : Number(days) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="size-5 text-danger" aria-hidden="true" />
          {t('exclusion')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {exclusion ? (
          <Alert tone="warning" data-testid="exclusion-active">
            {exclusion.endsAt ? t('excludedUntil', { date: f.dateTime(exclusion.endsAt) }) : t('excludedForever')}
          </Alert>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{t('exclusionHint')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium">
                {t('exclusionPeriod')}
                <NativeSelect value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 w-48">
                  {[1, 7, 30, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {t('days', { days: d })}
                    </option>
                  ))}
                  <option value="permanent">{t('permanent')}</option>
                </NativeSelect>
              </label>
              {confirm ? (
                <>
                  <Button variant="danger" onClick={() => run.mutate()} loading={run.isPending}>
                    {t('exclude')}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>
                    ✕
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setConfirm(true)}>
                  {t('exclude')}
                </Button>
              )}
            </div>
            {confirm ? <Alert tone="warning">{t('excludeConfirm')}</Alert> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** F1.4 — account dashboard: RON balance, open tickets, recent activity, profile, language, limits, self-exclusion. */
export default function AccountPage() {
  const t = useTranslations();
  const f = useFormat();
  const authed = useRequireAuth();
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/me/dashboard'), enabled: authed, refetchInterval: 20_000 });
  useEffect(() => {
    if (data) useAuth.getState().setUser(data.user);
  }, [data]);

  if (!data) return <Skeleton className="h-64" />;
  const user = useAuth.getState().user ?? data.user;

  return (
    <div className="space-y-4">
      <PageTitle sub={t('account.title')}>{t('account.welcome', { name: user.name.split(' ')[0] ?? user.name })}</PageTitle>
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <Stat label={t('account.balance')} value={f.ron(user.balanceBani)} testId="account-balance" />
          <Stat label={t('account.openTickets')} value={String(data.openTickets)} />
          <Stat label={t('account.openStake')} value={f.ron(data.openStakeBani)} />
          <Stat label={t('account.openWin')} value={f.ron(data.openPotentialWinBani)} />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('account.recent')}</CardTitle>
            <Link href="/account/wallet" className="text-sm font-semibold text-brand">
              {t('account.viewAll')}
            </Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {data.recentTransactions.length === 0 ? <li className="p-4 text-sm text-ink-muted">{t('wallet.empty')}</li> : null}
            {data.recentTransactions.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold">{t(`txType.${r.type}`)}</span>
                  <span className="block text-xs text-ink-faint">{f.dateTime(r.createdAt)}</span>
                </span>
                <span className={cn('font-bold tabular-nums', r.amountBani > 0 && 'text-success')}>
                  {r.amountBani > 0 ? '+' : ''}
                  {f.ron(r.amountBani)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid gap-3">
          {[
            { href: '/my-bets', icon: Receipt, label: t('account.myBets') },
            { href: '/account/wallet', icon: Wallet, label: t('account.wallet') },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-card p-4 font-semibold hover:border-brand">
              <span className="flex items-center gap-3">
                <Icon className="size-5 text-brand" aria-hidden="true" />
                {label}
              </span>
              <ChevronRight className="size-4 text-ink-muted" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
      <ProfileCard user={user} />
      <PreferencesCard user={user} />
      <LimitsCard limits={data.limits} />
      <ExclusionCard exclusion={data.selfExclusion} />
    </div>
  );
}
