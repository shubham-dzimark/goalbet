'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Layers, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { type TicketDto, combineOdds, parseRonToBani, potentialWin } from '@goalbet/shared';
import { Alert, Badge, Button, NativeSelect, Tabs, TabsList, TabsTrigger, cn } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { type SessionUser, useAuth } from '@/lib/auth-store';
import { useFormat } from '@/lib/format';
import { type OddsPref, type SlipItem, type SlipMode, slipHasConflict, useSlip } from '@/lib/slip-store';
import { useErrorMessage } from '@/lib/use-error-message';

const QUICK_STAKES = [10, 20, 50, 100];

/** Keeps slip prices and availability fresh while the slip is open. */
function useSlipRefresh() {
  const ids = useSlip((s) => s.items.map((i) => i.selectionId).join(','));
  const applyUpdates = useSlip((s) => s.applyUpdates);
  const { data } = useQuery({
    queryKey: ['slip-odds', ids],
    queryFn: () => api<{ id: string; oddsMilli: number; available: boolean; live: boolean }[]>(`/catalog/selections?ids=${ids}`),
    enabled: ids.length > 0,
    refetchInterval: 4_000,
  });
  useEffect(() => {
    if (data) applyUpdates(data);
  }, [data, applyUpdates]);
}

function StakeInput({ value, onChange, id, label }: { value: string; onChange: (v: string) => void; id: string; label: string }) {
  return (
    <label className="relative block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 10))}
        className="h-10 w-full rounded-md border border-line bg-card pl-3 pr-12 text-right text-base font-bold tabular-nums focus:border-brand focus:outline-none"
        data-testid={id}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-muted">RON</span>
    </label>
  );
}

function SlipLine({ item, stake, onStake }: { item: SlipItem; stake?: string; onStake?: (v: string) => void }) {
  const t = useTranslations('slip');
  const f = useFormat();
  const remove = useSlip((s) => s.remove);
  const stakeBani = stake !== undefined ? parseRonToBani(stake) : null;
  return (
    <li className={cn('border-b border-line px-3 py-2.5', !item.available && 'bg-card-alt')} data-testid="slip-item">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{item.outcomeName}</p>
          <p className="truncate text-xs text-ink-muted">{item.marketName}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
            {item.live ? <Badge tone="live" className="px-1.5 py-0 text-[10px]">LIVE</Badge> : null}
            {item.eventName}
          </p>
        </div>
        <div className="text-right">
          {!item.available ? (
            <Badge tone="warning">{t('unavailable')}</Badge>
          ) : (
            <>
              <p
                className={cn(
                  'font-bold tabular-nums',
                  item.prevOddsMilli !== null && (item.oddsMilli > item.prevOddsMilli ? 'text-odds-up' : 'text-odds-down'),
                )}
                data-testid="slip-odds"
              >
                {f.odds(item.oddsMilli)}
              </p>
              {item.prevOddsMilli !== null ? (
                <p className="text-[11px] text-ink-faint line-through">{t('was', { odds: f.odds(item.prevOddsMilli) })}</p>
              ) : null}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => remove(item.selectionId)}
          className="-mr-1 rounded p-1 text-ink-faint hover:bg-card-alt hover:text-ink"
          aria-label={t('remove')}
        >
          <X className="size-4" />
        </button>
      </div>
      {onStake ? (
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
          <StakeInput id={`stake-${item.selectionId}`} value={stake ?? ''} onChange={onStake} label={t('stake')} />
          <p className="text-right text-xs text-ink-muted">
            {t('potentialWin')}
            <br />
            <span className="font-bold text-ink">{f.ron(stakeBani ? potentialWin(stakeBani, item.oddsMilli) : 0)}</span>
          </p>
        </div>
      ) : null}
    </li>
  );
}

/** F1.12 — review selections, enter stake (RON), see potential winnings, place. */
export function BetSlip({ className }: { className?: string }) {
  useSlipRefresh();
  const t = useTranslations('slip');
  const tn = useTranslations('nav');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const qc = useQueryClient();
  const slip = useSlip();
  const { status, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; oddsChanged: boolean } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) slip.setOddsPref(user.oddsChangePreference);
    // follow the profile preference when the player logs in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const items = slip.items;
  const conflict = slipHasConflict(items);
  const accaOdds = useMemo(() => (items.length > 0 ? combineOdds(items.map((i) => i.oddsMilli)) : 0), [items]);
  const accaStake = parseRonToBani(slip.accaStake) ?? 0;
  const singles = items.map((i) => ({ item: i, stake: parseRonToBani(slip.singleStakes[i.selectionId] ?? '10') ?? 0 }));
  const totalStake = slip.mode === 'acca' ? accaStake : singles.reduce((a, s) => a + s.stake, 0);
  const unaccepted = items.some((i) => i.prevOddsMilli !== null);
  const anyUnavailable = items.some((i) => !i.available);
  const hasLive = items.some((i) => i.live);

  const canPlace =
    status === 'authed' &&
    items.length > 0 &&
    !busy &&
    !anyUnavailable &&
    slip.mode !== 'builder' &&
    (slip.mode === 'single' ? singles.every((s) => s.stake > 0) : !conflict && items.length >= 2 && accaStake > 0);

  const refreshUser = async () => {
    const me = await api<SessionUser>('/me').catch(() => null);
    if (me) useAuth.getState().setUser(me);
    void qc.invalidateQueries({ queryKey: ['ticket-counts'] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'ODDS_CHANGED') {
      const changes = (e.details?.['changes'] as { selectionId: string; currentOddsMilli: number }[] | undefined) ?? [];
      slip.applyUpdates(
        changes.map((c) => ({
          id: c.selectionId,
          oddsMilli: c.currentOddsMilli,
          available: true,
          live: items.find((i) => i.selectionId === c.selectionId)?.live ?? false,
        })),
      );
      setError({ text: toMessage(e), oddsChanged: true });
      return;
    }
    setError({ text: toMessage(e), oddsChanged: false });
  };

  const placeOne = (type: 'SINGLE' | 'ACCA', stakeBani: number, legs: SlipItem[]) =>
    api<TicketDto>('/bets', {
      method: 'POST',
      headers: { 'Idempotency-Key': newIdempotencyKey() },
      body: {
        type,
        stakeBani,
        oddsChangePreference: slip.oddsPref,
        legs: legs.map((l) => ({ kind: 'SELECTION', selectionId: l.selectionId, oddsMilli: l.oddsMilli })),
      },
    });

  const place = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    slip.acceptChanges();
    try {
      if (slip.mode === 'acca') {
        const ticket = await placeOne('ACCA', accaStake, items);
        slip.clear();
        setSuccess(t('placed', { code: ticket.code }));
      } else {
        const placed: TicketDto[] = [];
        for (const s of singles) {
          try {
            placed.push(await placeOne('SINGLE', s.stake, [s.item]));
            slip.remove(s.item.selectionId);
          } catch (e) {
            onError(e);
            break;
          }
        }
        if (placed.length === 1) setSuccess(t('placed', { code: placed[0]!.code }));
        else if (placed.length > 1) setSuccess(t('placedMany', { count: placed.length }));
      }
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
      void refreshUser();
    }
  };

  return (
    <section className={cn('flex flex-col', className)} aria-label={t('title')} data-testid="bet-slip">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-chrome px-3 py-2.5 text-chrome-ink">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase">
          <Layers className="size-4 text-brand" aria-hidden="true" />
          {t('title')}
          {items.length > 0 ? <Badge tone="brand">{items.length}</Badge> : null}
        </h2>
        {items.length > 0 ? (
          <button type="button" onClick={slip.clear} className="flex items-center gap-1 text-xs font-semibold text-chrome-muted hover:text-chrome-ink">
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t('clear')}
          </button>
        ) : null}
      </header>

      <Tabs value={slip.mode} onValueChange={(v) => slip.setMode(v as SlipMode)}>
        <TabsList className="px-2">
          <TabsTrigger value="single" data-testid="slip-tab-single">{t('single')}</TabsTrigger>
          <TabsTrigger value="acca" data-testid="slip-tab-acca">{t('acca')}</TabsTrigger>
          <TabsTrigger value="builder" data-testid="slip-tab-builder">{t('builder')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {success ? (
        <Alert tone="success" className="m-3 flex items-center gap-2" data-testid="slip-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{success}</span>
          <Link href="/my-bets" className="font-bold underline">
            {tn('myBets')}
          </Link>
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="font-semibold">{t('empty')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('emptyHint')}</p>
        </div>
      ) : (
        <>
          <ul className="max-h-[50vh] overflow-y-auto">
            {items.map((item) => (
              <SlipLine
                key={item.selectionId}
                item={item}
                {...(slip.mode === 'single'
                  ? {
                      stake: slip.singleStakes[item.selectionId] ?? '10',
                      onStake: (v: string) => slip.setSingleStake(item.selectionId, v),
                    }
                  : {})}
              />
            ))}
          </ul>

          <div className="space-y-3 p-3">
            {slip.mode === 'builder' ? <Alert tone="info">{t('builderSoon')}</Alert> : null}
            {slip.mode === 'acca' && conflict ? (
              <Alert tone="warning" className="flex items-start gap-2" data-testid="slip-conflict">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t('conflict')}
              </Alert>
            ) : null}
            {slip.mode === 'acca' && !conflict && items.length < 2 ? <Alert tone="info">{t('needTwo')}</Alert> : null}

            {slip.mode === 'acca' ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{t('totalOdds')}</span>
                  <span className="font-bold tabular-nums" data-testid="slip-total-odds">{f.odds(accaOdds || 1000)}</span>
                </div>
                <StakeInput id="stake-acca" value={slip.accaStake} onChange={slip.setAccaStake} label={t('stake')} />
              </>
            ) : null}

            {slip.mode !== 'builder' ? (
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_STAKES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    data-testid={`quick-${q}`}
                    className="h-8 rounded-md bg-odds text-xs font-bold hover:bg-odds-hover"
                    onClick={() =>
                      slip.mode === 'acca' ? slip.setAccaStake(String(q)) : items.forEach((i) => slip.setSingleStake(i.selectionId, String(q)))
                    }
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="block text-xs text-ink-muted">
              {t('oddsPref')}
              <NativeSelect
                value={slip.oddsPref}
                onChange={(e) => slip.setOddsPref(e.target.value as OddsPref)}
                className="mt-1 h-9 text-sm"
                data-testid="slip-odds-pref"
              >
                {(['NONE', 'HIGHER', 'ANY'] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`pref${p}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <dl className="space-y-1 rounded-md bg-card-alt p-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t('totalStake')}</dt>
                <dd className="font-semibold tabular-nums">{f.ron(totalStake)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t('potentialWin')}</dt>
                <dd className="font-display text-xl font-bold text-brand-strong tabular-nums" data-testid="slip-potential-win">
                  {f.ron(
                    slip.mode === 'acca'
                      ? accaStake > 0 && accaOdds > 0
                        ? potentialWin(accaStake, accaOdds)
                        : 0
                      : singles.reduce((a, s) => a + (s.stake > 0 ? potentialWin(s.stake, s.item.oddsMilli) : 0), 0),
                  )}
                </dd>
              </div>
            </dl>

            {error ? (
              <Alert data-testid="slip-error">
                <p>{error.text}</p>
              </Alert>
            ) : null}

            {status !== 'authed' ? (
              <Button asChild size="lg" className="w-full">
                <Link href="/login">{t('loginToBet')}</Link>
              </Button>
            ) : unaccepted || error?.oddsChanged ? (
              <Button size="lg" className="w-full" variant="secondary" onClick={() => { slip.acceptChanges(); setError(null); }} data-testid="slip-accept-odds">
                {t('acceptOdds')}
              </Button>
            ) : (
              <Button size="lg" className="w-full" disabled={!canPlace} loading={busy} onClick={place} data-testid="slip-place">
                {busy && hasLive ? t('liveDelay') : slip.mode === 'single' && items.length > 1 ? t('placeMany', { count: items.length }) : t('place')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
