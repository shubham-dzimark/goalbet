'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronRight, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, type FormEvent, useEffect, useState } from 'react';
import {
  USER_LIMIT_TYPES,
  type UserLimitType,
  type WalletTransactionDto,
  parseRonToBani,
  REALITY_CHECK_MINUTES,
} from '@goalbet/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  NativeSelect,
  Skeleton,
  cn,
} from '@goalbet/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Segmented } from '@/components/fx/segmented';
import { TabPanel } from '@/components/fx/tab-panel';
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
    <div className="rounded-2xl bg-tint/[0.05] p-4 ring-1 ring-line">
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
            {msg ? (
              <span className={cn('text-sm', msg.ok ? 'text-success' : 'text-danger')}>{fe(msg.text)}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const update = async (body: Partial<Pick<SessionUser, 'oddsChangePreference' | 'realityCheckMinutes'>>) => {
    const u = await api<SessionUser>('/me', { method: 'PATCH', body });
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
          <NativeSelect value={user.oddsChangePreference} onChange={(e) => void update({ oddsChangePreference: e.target.value as SessionUser['oddsChangePreference'] })}>
            {(['NONE', 'HIGHER', 'ANY'] as const).map((p) => (
              <option key={p} value={p}>
                {t(`slip.pref${p}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
          {t('account.realityCheck')}
          <NativeSelect
            value={user.realityCheckMinutes ?? ''}
            onChange={(e) => void update({ realityCheckMinutes: e.target.value ? Number(e.target.value) : null })}
            data-testid="reality-check-select"
          >
            <option value="">{t('account.realityCheckOff')}</option>
            {REALITY_CHECK_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t('account.realityCheckEvery', { count: m })}
              </option>
            ))}
          </NativeSelect>
          <span className="block text-xs font-normal text-ink-muted">{t('account.realityCheckHint')}</span>
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
                  {l?.pendingAmountBani
                    ? ` · ${t('account.pendingLimit', { amount: f.ron(l.pendingAmountBani), date: f.dateTime(l.effectiveAt) })}`
                    : ''}
                  {l?.pendingRemoval
                    ? ` · ${t('account.pendingRemoval', { date: f.dateTime(l.effectiveAt) })}`
                    : ''}
                </p>
              </div>
              <Input
                inputMode="decimal"
                aria-label={t('account.amountRon')}
                placeholder="RON"
                data-testid={`limit-input-${type}`}
                value={values[type] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [type]: e.target.value }))}
              />
              <Button type="submit" variant="secondary" size="md" data-testid={`limit-set-${type}`}>
                {t('account.set')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={!l?.amountBani}
                onClick={() => void set(type, null)}
              >
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
    mutationFn: () =>
      api('/me/self-exclusion', {
        method: 'POST',
        body: { days: days === 'permanent' ? null : Number(days) },
      }),
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
            {exclusion.endsAt
              ? t('excludedUntil', { date: f.dateTime(exclusion.endsAt) })
              : t('excludedForever')}
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

type AccountTab = 'overview' | 'profile' | 'preferences' | 'limits' | 'exclusion';

/** F1.4 — account: profile header, then Overview / Profile / Preferences / Limits / Self-exclusion tabs. */
export default function AccountPage() {
  const t = useTranslations();
  const f = useFormat();
  const authed = useRequireAuth();
  const [tab, setTab] = useState<AccountTab>('overview');
  // deep links such as /account?tab=limits (reality check, responsible gambling page)
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && ['overview', 'profile', 'preferences', 'limits', 'exclusion'].includes(wanted)) setTab(wanted as AccountTab);
  }, []);
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/me/dashboard'),
    enabled: authed,
    refetchInterval: 20_000,
  });
  useEffect(() => {
    if (data) useAuth.getState().setUser(data.user);
  }, [data]);

  if (!data) return <Skeleton className="h-64 rounded-3xl" />;
  const user = useAuth.getState().user ?? data.user;
  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(34rem_16rem_at_0%_0%,rgb(var(--brand-rgb)/0.16),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-brand to-accent font-display text-3xl font-extrabold text-brand-ink shadow-[0_0_40px_rgb(var(--brand-rgb)/0.35)]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">{t('account.title')}</p>
            <h1 className="truncate font-display text-4xl font-extrabold uppercase italic leading-tight">
              {user.name}
            </h1>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-ink-faint">{t('account.balance')}</p>
            <p
              className="font-display text-4xl font-bold tabular-nums text-brand"
              data-testid="account-balance"
            >
              {f.ron(user.balanceBani)}
            </p>
          </div>
        </div>
        {data.selfExclusion ? (
          <Alert tone="warning" className="relative mt-4" data-testid="exclusion-active">
            {data.selfExclusion.endsAt
              ? t('account.excludedUntil', { date: f.dateTime(data.selfExclusion.endsAt) })
              : t('account.excludedForever')}
          </Alert>
        ) : null}
      </section>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: t('account.tabs.overview'), testId: 'account-tab-overview' },
          { value: 'profile', label: t('account.profile'), testId: 'account-tab-profile' },
          { value: 'preferences', label: t('account.preferences'), testId: 'account-tab-preferences' },
          { value: 'limits', label: t('account.limits'), testId: 'account-tab-limits' },
          { value: 'exclusion', label: t('account.exclusion'), testId: 'account-tab-exclusion' },
        ]}
      />

      <TabPanel tab={tab}>
        {tab === 'overview' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={t('account.openTickets')} value={String(data.openTickets)} />
              <Stat label={t('account.openStake')} value={f.ron(data.openStakeBani)} />
              <Stat label={t('account.openWin')} value={f.ron(data.openPotentialWinBani)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Card>
                <CardHeader>
                  <CardTitle>{t('account.recent')}</CardTitle>
                  <Link href="/account/wallet" className="text-sm font-semibold text-brand">
                    {t('account.viewAll')}
                  </Link>
                </CardHeader>
                <ul className="divide-y divide-line">
                  {data.recentTransactions.length === 0 ? (
                    <li className="p-4 text-sm text-ink-muted">{t('wallet.empty')}</li>
                  ) : null}
                  {data.recentTransactions.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        <span className="font-semibold">{t(`txType.${r.type}`)}</span>
                        <span className="block text-xs text-ink-faint">{f.dateTime(r.createdAt)}</span>
                      </span>
                      <span
                        className={cn(
                          'font-display text-lg font-bold tabular-nums',
                          r.amountBani > 0 && 'text-brand',
                        )}
                      >
                        {r.amountBani > 0 ? '+' : ''}
                        {f.ron(r.amountBani)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <div className="grid content-start gap-3">
                {[
                  { href: '/my-bets', icon: Receipt, label: t('account.myBets') },
                  { href: '/account/wallet', icon: Wallet, label: t('account.wallet') },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="glass group flex items-center justify-between rounded-[var(--radius-card)] p-4 font-semibold transition-all hover:-translate-y-0.5 hover:border-brand/40"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      {label}
                    </span>
                    <ChevronRight
                      className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {tab === 'profile' ? <ProfileCard user={user} /> : null}
        {tab === 'preferences' ? <PreferencesCard user={user} /> : null}
        {tab === 'limits' ? <LimitsCard limits={data.limits} /> : null}
        {tab === 'exclusion' ? <ExclusionCard exclusion={data.selfExclusion} /> : null}
      </TabPanel>
    </div>
  );
}
