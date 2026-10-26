'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, Database, Eye, EyeOff, KeyRound, Lock, RefreshCw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type AdminDataProviderStatus, type AdminDataProviderTest } from '@goalbet/shared';
import { Alert, Badge, Button, EmptyState, Input, Skeleton, cn } from '@goalbet/ui';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { PageHeader, Panel, StatCard } from '@/components/ui/page';
import { useCan, useErrorText } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';

type KeyMode = 'keep' | 'replace' | 'remove';

/** Super admin: which sports-data provider feeds the site, its API key and call budget. */
export default function DataProviderPage() {
  const t = useTranslations('dataProvider');
  const can = useCan();
  const isSuper = can();
  const { data, isLoading } = useQuery({
    queryKey: ['data-provider'],
    queryFn: () => adminApi<AdminDataProviderStatus>('/admin/data-provider'),
    enabled: isSuper,
    refetchInterval: 15_000,
  });

  if (!isSuper) {
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState icon={<Lock className="size-8" />} title={t('forbiddenTitle')}>
          {t('forbiddenHelp')}
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} actions={data ? <SyncButton /> : null} />
      {isLoading || !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" /> : <Content data={data} />}
    </>
  );
}

function SyncButton() {
  const t = useTranslations('dataProvider');
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await adminApi('/admin/data-provider/sync', { method: 'POST' });
          toast.success(t('syncStarted'));
        } catch (e) {
          toast.error(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
      data-testid="dp-sync"
    >
      <RefreshCw aria-hidden="true" />
      {t('sync')}
    </Button>
  );
}

function Content({ data }: { data: AdminDataProviderStatus }) {
  const t = useTranslations('dataProvider');
  const f = useFmt();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [provider, setProvider] = useState(data.provider);
  const [keyMode, setKeyMode] = useState<KeyMode>(data.apiKey.set ? 'keep' : 'replace');
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [leagues, setLeagues] = useState(data.leagues.filter((l) => l.selected).map((l) => l.id));
  const [dailyBudget, setDailyBudget] = useState(String(data.dailyBudget));
  const [perMinute, setPerMinute] = useState(String(data.perMinute));
  const [test, setTest] = useState<AdminDataProviderTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset the form when the saved settings change (e.g. after saving)
  useEffect(() => {
    setProvider(data.provider);
    setKeyMode(data.apiKey.set ? 'keep' : 'replace');
    setNewKey('');
    setLeagues(data.leagues.filter((l) => l.selected).map((l) => l.id));
    setDailyBudget(String(data.dailyBudget));
    setPerMinute(String(data.perMinute));
  }, [data.updatedAt, data.provider, data.apiKey.set, data.dailyBudget, data.perMinute, data.leagues]);

  const usage = data.usage;
  const feedStale = data.feed.ageSeconds === null || data.feed.ageSeconds > data.feed.stallSeconds;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await adminApi<AdminDataProviderTest>('/admin/data-provider/test', { method: 'POST', body: keyMode === 'replace' && newKey ? { apiKey: newKey } : {} }));
    } catch (e) {
      setTest({ ok: false, error: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const validate = () => {
    if (provider === 'api-football' && keyMode === 'replace' && newKey.trim().length < 10) return t('errors.key');
    if (provider === 'api-football' && keyMode === 'remove') return t('errors.removeWhileActive');
    if (leagues.length === 0) return t('errors.leagues');
    const d = Number(dailyBudget);
    const m = Number(perMinute);
    if (!Number.isInteger(d) || d < 10 || !Number.isInteger(m) || m < 1) return t('errors.budget');
    return null;
  };

  const save = async (reason: string) => {
    const body = {
      provider,
      ...(keyMode === 'replace' ? { apiKey: newKey.trim() } : keyMode === 'remove' ? { apiKey: null } : {}),
      leagues,
      dailyBudget: Number(dailyBudget),
      perMinute: Number(perMinute),
      reason,
    };
    qc.setQueryData(['data-provider'], await adminApi<AdminDataProviderStatus>('/admin/data-provider', { method: 'PUT', body }));
    setTest(null);
    toast.success(t('saved'));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('stats.provider')}
          value={t(`providers.${data.provider}`)}
          icon={Database}
          tone="brand"
          hint={data.source === 'admin' ? t('stats.fromPanel', { date: data.updatedAt ? f.dateTime(data.updatedAt) : '' }) : t('stats.fromEnv')}
          testId="dp-provider"
        />
        <StatCard label={t('stats.key')} value={data.apiKey.set ? `•••• ${data.apiKey.hint ?? ''}` : t('stats.noKey')} icon={KeyRound} tone={data.apiKey.set ? 'info' : 'neutral'} />
        <StatCard
          label={t('stats.feed')}
          value={data.feed.ageSeconds === null ? '—' : t('stats.age', { s: data.feed.ageSeconds })}
          icon={Activity}
          tone={feedStale ? 'live' : 'brand'}
          hint={feedStale ? t('stats.feedStale', { limit: data.feed.stallSeconds }) : t('stats.feedOk', { limit: data.feed.stallSeconds })}
        />
        <StatCard
          label={t('stats.usage')}
          value={usage ? `${usage.today} / ${usage.budget}` : '—'}
          hint={usage ? (usage.providerRemaining !== null ? t('stats.providerLeft', { n: usage.providerRemaining }) : t('stats.noCalls')) : t('stats.mockNoCalls')}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title={t('form.title')}>
          <div className="space-y-5" data-testid="dp-form">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('form.provider')}</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {(['api-football', 'mock'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={provider === p}
                    onClick={() => setProvider(p)}
                    className={cn('rounded-xl p-3 text-left ring-1 transition-colors', provider === p ? 'bg-brand-soft ring-brand' : 'bg-tint/[0.03] ring-line hover:ring-line-strong')}
                    data-testid={`dp-provider-${p}`}
                  >
                    <span className="block text-sm font-semibold">{t(`providers.${p}`)}</span>
                    <span className="block text-xs text-ink-muted">{t(`providers.${p}_help`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t('form.key')}</legend>
              {data.apiKey.set && keyMode !== 'replace' ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint/[0.04] px-3 py-2 ring-1 ring-line">
                  <KeyRound className="size-4 text-brand" aria-hidden="true" />
                  <span className="font-mono text-sm">•••• •••• {data.apiKey.hint}</span>
                  {keyMode === 'remove' ? <Badge tone="danger">{t('form.willRemove')}</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setKeyMode('replace')} data-testid="dp-replace">
                      {t('form.replace')}
                    </Button>
                    {keyMode === 'remove' ? (
                      <Button size="sm" variant="ghost" onClick={() => setKeyMode('keep')}>
                        {t('form.undo')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setKeyMode('remove')}>
                        {t('form.remove')}
                      </Button>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder={t('form.keyPlaceholder')}
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-10 font-mono"
                      aria-label={t('form.key')}
                      data-testid="dp-key"
                    />
                    <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={t(showKey ? 'form.hide' : 'form.show')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink">
                      {showKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {data.apiKey.set ? (
                    <Button variant="ghost" onClick={() => (setKeyMode('keep'), setNewKey(''))}>
                      {t('form.undo')}
                    </Button>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" onClick={() => void runTest()} loading={testing} disabled={keyMode === 'remove' || (keyMode === 'replace' && newKey.trim().length < 10 && !data.apiKey.set)} data-testid="dp-test">
                  {t('form.test')}
                </Button>
                <p className="text-xs text-ink-faint">{t('form.keyHelp')}</p>
              </div>
              {test ? (
                <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1', test.ok ? 'bg-success/10 text-success ring-success/30' : 'bg-danger/10 text-danger ring-danger/30')} data-testid="dp-test-result">
                  {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  <span>
                    {test.ok
                      ? t('test.ok', { plan: test.plan ?? '', used: test.requestsToday ?? 0, limit: test.limitDay ?? 0 })
                      : t('test.failed', { error: test.error === 'NO_KEY' ? t('test.noKey') : (test.error ?? '') })}
                    {test.ok && test.subscriptionEnd ? <span className="block text-xs opacity-80">{t('test.until', { date: f.date(test.subscriptionEnd) })}</span> : null}
                    {test.ok && test.active === false ? <span className="block text-xs">{t('test.inactive')}</span> : null}
                  </span>
                </div>
              ) : null}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.dailyBudget')}</span>
                <Input inputMode="numeric" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value.replace(/\D/g, ''))} />
                <span className="mt-1 block text-xs text-ink-faint">{t('form.dailyBudgetHelp')}</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.perMinute')}</span>
                <Input inputMode="numeric" value={perMinute} onChange={(e) => setPerMinute(e.target.value.replace(/\D/g, ''))} />
                <span className="mt-1 block text-xs text-ink-faint">{t('form.perMinuteHelp')}</span>
              </label>
            </div>

            {error ? <Alert>{error}</Alert> : null}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const problem = validate();
                  setError(problem);
                  if (!problem) setConfirm(true);
                }}
                data-testid="dp-save"
              >
                {t('form.save')}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title={t('leagues.title')}>
          <p className="mb-3 text-sm text-ink-muted">{t('leagues.help')}</p>
          <ul className="space-y-1.5" data-testid="dp-leagues">
            {data.leagues.map((l) => {
              const on = leagues.includes(l.id);
              return (
                <li key={l.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 transition-colors', on ? 'bg-brand-soft ring-brand/40' : 'ring-line hover:ring-line-strong')}>
                    <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={on} onChange={() => setLeagues((v) => (on ? v.filter((x) => x !== l.id) : [...v, l.id]))} />
                    <span className="grid h-5 w-8 place-items-center rounded bg-tint/[0.07] text-[10px] font-bold">{l.countryCode}</span>
                    <span className="flex-1 text-sm font-semibold">{l.name}</span>
                    <span className="text-xs text-ink-faint">{l.country}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">{t('leagues.note')}</p>
        </Panel>
      </div>

      <ReasonDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('confirm.title')}
        description={
          provider !== data.provider ? t('confirm.switch', { from: t(`providers.${data.provider}`), to: t(`providers.${provider}`) }) : t('confirm.help')
        }
        confirmLabel={t('form.save')}
        onConfirm={save}
      />
    </div>
  );
}
