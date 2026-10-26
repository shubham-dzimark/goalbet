'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Ticket, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { type TicketDto, combineOdds, parseRonToBani, potentialWin } from '@goalbet/shared';
import { Alert, Button, cn } from '@goalbet/ui';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { Segmented } from '@/components/fx/segmented';
import { Link } from '@/i18n/navigation';
import { ApiError, api, newIdempotencyKey } from '@/lib/api';
import { type SessionUser, useAuth } from '@/lib/auth-store';
import { useFormat } from '@/lib/format';
import { usePoll, useWatch } from '@/lib/realtime';
import { type OddsPref, type SlipItem, type SlipMode, slipHasConflict, useSlip } from '@/lib/slip-store';
import { useErrorMessage } from '@/lib/use-error-message';

const QUICK_STAKES = [10, 20, 50, 100];

/** Keeps slip prices and availability fresh while the slip is open. */
function useSlipRefresh() {
  const ids = useSlip((s) => s.items.map((i) => i.selectionId).join(','));
  const eventIds = useSlip((s) => [...new Set(s.items.map((i) => i.eventId))].join(','));
  const applyUpdates = useSlip((s) => s.applyUpdates);
  // pushed changes to these matches re-fetch the slip prices at once (see lib/realtime.ts)
  useWatch({ eventIds: eventIds ? eventIds.split(',') : [] });
  const poll = usePoll(4_000);
  const { data } = useQuery({
    queryKey: ['slip-odds', ids],
    queryFn: () => api<{ id: string; oddsMilli: number; available: boolean; live: boolean }[]>(`/catalog/selections?ids=${ids}`),
    enabled: ids.length > 0,
    refetchInterval: poll,
  });
  useEffect(() => {
    if (data) applyUpdates(data);
  }, [data, applyUpdates]);
}

function StakeInput({ value, onChange, id, label, large = false }: { value: string; onChange: (v: string) => void; id: string; label: string; large?: boolean }) {
  return (
    <label className="relative block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 10))}
        className={cn(
          'w-full rounded-xl border border-line bg-tint/[0.04] pl-3 pr-12 text-right font-display font-bold tabular-nums text-ink transition-colors focus:border-brand/60 focus:bg-tint/[0.07] focus:outline-none',
          large ? 'h-14 text-3xl' : 'h-10 text-lg',
        )}
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
  const changed = item.prevOddsMilli !== null;
  const up = changed && item.oddsMilli > (item.prevOddsMilli ?? 0);

  // enter/exit/reflow are handled by the parent's AnimatePresence + layout
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 28, scale: 0.97 }}
      animate={{ opacity: item.available ? 1 : 0.6, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, transition: { duration: 0.22 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="relative overflow-hidden rounded-2xl bg-tint/[0.04] p-3 ring-1 ring-line"
      data-testid="slip-item"
    >
      <span aria-hidden="true" className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', item.live ? 'bg-live' : 'bg-brand/70')} />
      <div className="flex items-start gap-2 pl-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{item.outcomeName}</p>
          <p className="truncate text-xs text-ink-muted">{item.marketName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-ink-faint">
            {item.live ? <span className="rounded bg-live px-1 text-[9px] font-bold text-white">LIVE</span> : null}
            {item.eventName}
          </p>
        </div>
        <div className="text-right">
          {!item.available ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">{t('unavailable')}</span>
          ) : (
            <>
              <p className={cn('flex items-center justify-end gap-0.5 font-display text-xl font-bold tabular-nums', changed && (up ? 'text-odds-up' : 'text-odds-down'))} data-testid="slip-odds">
                {changed ? up ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" /> : null}
                {f.odds(item.oddsMilli)}
              </p>
              {changed ? <p className="text-[10px] text-ink-faint line-through">{t('was', { odds: f.odds(item.prevOddsMilli!) })}</p> : null}
            </>
          )}
        </div>
        <button type="button" onClick={() => remove(item.selectionId)} className="-mr-1 -mt-1 rounded-lg p-1 text-ink-faint hover:bg-tint/10 hover:text-ink" aria-label={t('remove')}>
          <X className="size-4" />
        </button>
      </div>
      {onStake ? (
        <div className="mt-2.5 grid grid-cols-[1fr_auto] items-center gap-3 pl-1.5">
          <StakeInput id={`stake-${item.selectionId}`} value={stake ?? ''} onChange={onStake} label={t('stake')} />
          <p className="text-right text-[11px] text-ink-muted">
            {t('potentialWin')}
            <br />
            <span className="font-bold text-ink">{f.ron(stakeBani ? potentialWin(stakeBani, item.oddsMilli) : 0)}</span>
          </p>
        </div>
      ) : null}
    </motion.li>
  );
}

function PlacedStamp({ code, count, onDone }: { code: string | null; count: number; onDone: () => void }) {
  const t = useTranslations('slip');
  const tn = useTranslations('nav');
  return (
    <motion.div
      initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: -2, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      className="m-3 rounded-2xl border border-dashed border-brand/50 bg-brand/[0.08] p-4 text-center"
      data-testid="slip-success"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 9, delay: 0.25 }}
        className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-brand text-brand-ink shadow-[0_0_30px_rgb(var(--brand-rgb)/0.6)]"
      >
        <Check className="size-6" aria-hidden="true" />
      </motion.span>
      <p className="font-display text-xl font-bold uppercase italic">{code ? t('placed', { code }) : t('placedMany', { count })}</p>
      <div className="mt-3 flex justify-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href="/my-bets">{tn('myBets')}</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('newBet')}
        </Button>
      </div>
    </motion.div>
  );
}

/** F1.12 — review selections, enter stake (RON), see potential winnings, place. */
export function BetSlip({ className }: { className?: string }) {
  useSlipRefresh();
  const t = useTranslations('slip');
  const f = useFormat();
  const toMessage = useErrorMessage();
  const qc = useQueryClient();
  const slip = useSlip();
  const { status, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; oddsChanged: boolean } | null>(null);
  const [success, setSuccess] = useState<{ code: string | null; count: number } | null>(null);
  const reduce = useReducedMotion();

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
  const totalWin =
    slip.mode === 'acca'
      ? accaStake > 0 && accaOdds > 0
        ? potentialWin(accaStake, accaOdds)
        : 0
      : singles.reduce((a, s) => a + (s.stake > 0 ? potentialWin(s.stake, s.item.oddsMilli) : 0), 0);
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
        setSuccess({ code: ticket.code, count: 1 });
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
        if (placed.length > 0) setSuccess({ code: placed.length === 1 ? placed[0]!.code : null, count: placed.length });
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
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <h2 className="flex items-center gap-2.5 font-display text-2xl font-bold uppercase italic" data-slip-target>
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-ink shadow-[0_0_20px_rgb(var(--brand-rgb)/0.45)]">
            <Ticket className="size-5" aria-hidden="true" />
          </span>
          {t('title')}
          {items.length > 0 ? <span className="rounded-full bg-tint/10 px-2 py-0.5 font-sans text-xs not-italic text-ink">{items.length}</span> : null}
        </h2>
        {items.length > 0 ? (
          <button type="button" onClick={slip.clear} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-tint/10 hover:text-ink">
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t('clear')}
          </button>
        ) : null}
      </header>

      <div className="px-4">
        <Segmented
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          size="sm"
          ariaLabel={t('title')}
          value={slip.mode}
          onChange={(v) => slip.setMode(v as SlipMode)}
          options={[
            { value: 'single', label: t('single'), testId: 'slip-tab-single' },
            { value: 'acca', label: t('acca'), testId: 'slip-tab-acca' },
            { value: 'builder', label: t('builder'), testId: 'slip-tab-builder' },
          ]}
        />
      </div>

      <AnimatePresence>
        {success ? <PlacedStamp key="placed" code={success.code} count={success.count} onDone={() => setSuccess(null)} /> : null}
      </AnimatePresence>

      {items.length === 0 ? (
        success ? null : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <svg viewBox="0 0 120 80" className="mb-4 h-20 w-32" aria-hidden="true">
              <rect x="10" y="12" width="100" height="56" rx="10" fill="rgb(var(--tint-rgb) / 0.04)" stroke="rgb(var(--tint-rgb) / 0.16)" strokeDasharray="4 4" />
              <circle cx="10" cy="40" r="7" fill="var(--color-surface)" />
              <circle cx="110" cy="40" r="7" fill="var(--color-surface)" />
              <rect x="28" y="28" width="40" height="5" rx="2.5" fill="rgb(var(--tint-rgb) / 0.18)" />
              <rect x="28" y="40" width="58" height="5" rx="2.5" fill="rgb(var(--tint-rgb) / 0.1)" />
              <rect x="74" y="26" width="20" height="10" rx="5" fill="var(--color-brand)" opacity="0.8" />
            </svg>
            <p className="font-semibold">{t('empty')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('emptyHint')}</p>
          </div>
        )
      ) : (
        <>
          <ul className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto overflow-x-hidden px-4">
            <AnimatePresence initial={false}>
              {items.map((item) => (
              <SlipLine
                key={item.selectionId}
                item={item}
                {...(slip.mode === 'single'
                  ? { stake: slip.singleStakes[item.selectionId] ?? '10', onStake: (v: string) => slip.setSingleStake(item.selectionId, v) }
                  : {})}
                />
              ))}
            </AnimatePresence>
          </ul>

          <div className="space-y-3 p-4">
            {slip.mode === 'builder' ? <Alert tone="info">{t('builderSoon')}</Alert> : null}
            {slip.mode === 'acca' && conflict ? (
              <Alert tone="warning" className="flex items-start gap-2" data-testid="slip-conflict">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t('conflict')}
              </Alert>
            ) : null}
            {slip.mode === 'acca' && !conflict && items.length < 2 ? <Alert tone="info">{t('needTwo')}</Alert> : null}

            {slip.mode === 'acca' ? <StakeInput id="stake-acca" value={slip.accaStake} onChange={slip.setAccaStake} label={t('stake')} large /> : null}

            {slip.mode !== 'builder' ? (
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_STAKES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    data-testid={`quick-${q}`}
                    className="h-9 rounded-xl bg-tint/[0.05] text-sm font-bold ring-1 ring-line transition-all hover:bg-tint/10 hover:ring-brand/40 active:scale-95"
                    onClick={() => (slip.mode === 'acca' ? slip.setAccaStake(String(q)) : items.forEach((i) => slip.setSingleStake(i.selectionId, String(q))))}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl bg-tint/[0.035] p-3 ring-1 ring-line">
              <dl className="space-y-1.5 text-sm">
                {slip.mode === 'acca' ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">{t('totalOdds')}</dt>
                    <dd className="font-display text-lg font-bold tabular-nums" data-testid="slip-total-odds">
                      {f.odds(accaOdds || 1000)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t('totalStake')}</dt>
                  <dd className="font-semibold tabular-nums">{f.ron(totalStake)}</dd>
                </div>
                <div className="flex items-end justify-between border-t border-line pt-2">
                  <dt className="text-ink-muted">{t('potentialWin')}</dt>
                  <dd>
                    <AnimatedNumber value={totalWin} format={f.ron} className="font-display text-2xl font-bold tabular-nums text-brand" testId="slip-potential-win" />
                  </dd>
                </div>
              </dl>
              <label className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-muted">
                {t('oddsPref')}
                <select
                  value={slip.oddsPref}
                  onChange={(e) => slip.setOddsPref(e.target.value as OddsPref)}
                  className="rounded-lg border border-line bg-card-solid px-2 py-1 text-xs text-ink focus:outline-none"
                  data-testid="slip-odds-pref"
                >
                  {(['NONE', 'HIGHER', 'ANY'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`pref${p}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <AnimatePresence>
              {error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto', x: reduce ? 0 : [0, -8, 8, -5, 5, 0] }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <Alert data-testid="slip-error">
                    <p>{error.text}</p>
                  </Alert>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {status !== 'authed' ? (
              <Button asChild size="lg" className="w-full">
                <Link href="/login">{t('loginToBet')}</Link>
              </Button>
            ) : unaccepted || error?.oddsChanged ? (
              <Button
                size="lg"
                className="w-full bg-warning text-boost-ink hover:bg-warning/90"
                onClick={() => {
                  slip.acceptChanges();
                  setError(null);
                }}
                data-testid="slip-accept-odds"
              >
                {t('acceptOdds')}
              </Button>
            ) : (
              <Button
                size="lg"
                className="relative w-full overflow-hidden text-base font-bold before:absolute before:inset-0 before:bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.45)_50%,transparent_70%)] before:bg-[length:200%_100%] before:[animation:gb-shimmer_2.5s_linear_infinite]"
                disabled={!canPlace}
                loading={busy}
                onClick={place}
                data-testid="slip-place"
              >
                {busy && hasLive ? t('liveDelay') : slip.mode === 'single' && items.length > 1 ? t('placeMany', { count: items.length }) : t('place')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
