'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { type EventDetailDto, type MarketDto, type MarketGroup, formatLine, marketGroupOf } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { Reveal } from '@/components/fx/reveal';
import { Segmented } from '@/components/fx/segmented';
import { TeamCrest } from '@/components/fx/team-crest';
import { gsap, prefersReducedMotion } from '@/lib/gsap';
import { useMarketText } from '@/lib/markets';
import { OddsButton } from './odds-button';

type Ev = EventDetailDto;

/** Markets that share a type/period/team and only differ by line are shown as one table. */
const LINE_TABLE = new Set(['TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'TOTAL_CORNERS', 'TOTAL_CARDS', 'ASIAN_HANDICAP', 'PLAYER_SHOTS']);

interface Block {
  key: string;
  title: string;
  markets: MarketDto[];
  kind: 'table' | 'buttons' | 'scores' | 'scorers';
}

function useBlocks(event: Ev, markets: MarketDto[]): Block[] {
  const t = useTranslations();
  const { marketTitle } = useMarketText();
  const blocks: Block[] = [];
  const byKey = new Map<string, Block>();
  for (const m of markets) {
    if (LINE_TABLE.has(m.type)) {
      const key = `${m.type}|${m.period}|${m.type === 'TEAM_TOTAL_GOALS' ? m.team : ''}`;
      let b = byKey.get(key);
      if (!b) {
        const base = t(`markets.${m.type}`);
        const withTeam = m.type === 'TEAM_TOTAL_GOALS' ? t('marketName.team', { name: base, team: m.team === 'AWAY' ? event.awayTeam : event.homeTeam }) : base;
        b = { key, title: m.period === 'H1' ? t('marketName.half', { name: withTeam }) : withTeam, markets: [], kind: 'table' };
        byKey.set(key, b);
        blocks.push(b);
      }
      b.markets.push(m);
    } else {
      blocks.push({
        key: m.id,
        title: marketTitle(m, event),
        markets: [m],
        kind: m.type === 'CORRECT_SCORE' ? 'scores' : m.type === 'ANYTIME_SCORER' ? 'scorers' : 'buttons',
      });
    }
  }
  return blocks;
}

function BlockCard({ block, event }: { block: Block; event: Ev }) {
  const { outcomeShort } = useMarketText();
  const [open, setOpen] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const first = block.markets[0]!;
  const asian = first.type === 'ASIAN_HANDICAP';

  const toggle = () => {
    const el = body.current;
    if (!el || prefersReducedMotion()) return setOpen((o) => !o);
    if (open) gsap.to(el, { height: 0, opacity: 0, duration: 0.3, ease: 'power2.inOut', onComplete: () => setOpen(false) });
    else {
      setOpen(true);
      gsap.fromTo(el, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.35, ease: 'power2.out' });
    }
  };

  return (
    <article data-reveal className="glass overflow-hidden rounded-[var(--radius-card)]" data-testid="market-block" data-market-type={first.type}>
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold hover:bg-tint/[0.03]" aria-expanded={open}>
        {block.title}
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform duration-300', !open && '-rotate-90')} aria-hidden="true" />
      </button>
      <div ref={body} className={cn('overflow-hidden', !open && 'h-0')}>
        <div className="border-t border-line p-3">
          {block.kind === 'table' ? (
            <div className="space-y-1.5">
              {asian ? (
                <div className="grid grid-cols-[64px_1fr_1fr] gap-1.5 px-1 text-[11px] font-semibold text-ink-muted">
                  <span />
                  <span className="flex items-center justify-center gap-1.5 truncate">
                    <TeamCrest name={event.homeTeam} logo={event.homeLogo} size={14} />
                    {event.homeTeam}
                  </span>
                  <span className="flex items-center justify-center gap-1.5 truncate">
                    <TeamCrest name={event.awayTeam} logo={event.awayLogo} size={14} />
                    {event.awayTeam}
                  </span>
                </div>
              ) : null}
              {block.markets.map((m) => (
                <div key={m.id} className="grid grid-cols-[64px_1fr_1fr] items-center gap-1.5 sm:grid-cols-[minmax(64px,150px)_1fr_1fr]">
                  <span className="truncate rounded-lg bg-tint/[0.04] px-2 py-1 text-center font-display tracking-tight text-sm font-semibold text-ink-muted">
                    {m.type === 'PLAYER_SHOTS' ? `${m.playerName} ${formatLine(m.line ?? 0)}` : formatLine(m.line ?? 0, asian)}
                  </span>
                  {m.selections.map((s) => (
                    <OddsButton key={s.id} event={event} market={m} selection={s} label={asian ? undefined : outcomeShort(m, s, event)} />
                  ))}
                </div>
              ))}
            </div>
          ) : block.kind === 'scores' ? (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {first.selections.map((s) => (
                <OddsButton key={s.id} event={event} market={first} selection={s} label={outcomeShort(first, s, event)} />
              ))}
            </div>
          ) : block.kind === 'scorers' ? (
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {(['HOME', 'AWAY'] as const).map((team) => (
                <div key={team} className="space-y-1.5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase text-ink-muted">
                    <TeamCrest name={team === 'HOME' ? event.homeTeam : event.awayTeam} logo={team === 'HOME' ? event.homeLogo : event.awayLogo} size={16} />
                    {team === 'HOME' ? event.homeTeam : event.awayTeam}
                  </p>
                  {first.selections
                    .filter((s) => s.team === team)
                    .map((s) => (
                      <OddsButton key={s.id} event={event} market={first} selection={s} label={s.label ?? s.outcome} />
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div className={cn('grid gap-1.5', first.selections.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {first.selections.map((s) => (
                <OddsButton key={s.id} event={event} market={first} selection={s} label={outcomeShort(first, s, event)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** F1.9 / F5.3 — every market group, with a sticky segmented tab bar. */
export function MarketBoard({ event }: { event: Ev }) {
  const t = useTranslations();
  const groups = [...new Set(event.markets.map((m) => marketGroupOf(m)))];
  const order: MarketGroup[] = ['MAIN', 'GOALS', 'HALF', 'HANDICAP', 'CORNERS', 'CARDS', 'SCORE', 'PLAYERS'];
  const present = order.filter((g) => groups.includes(g));
  const [tab, setTab] = useState<MarketGroup | 'ALL'>('ALL');
  const markets = tab === 'ALL' ? event.markets : event.markets.filter((m) => marketGroupOf(m) === tab);
  const blocks = useBlocks(event, markets);

  return (
    <div>
      <div className="sticky top-[4.5rem] z-30 -mx-1 mb-4 px-1 py-1 lg:top-3">
        <Segmented
          className="bg-chrome/90 backdrop-blur-xl"
          value={tab}
          onChange={setTab}
          options={(['ALL', ...present] as const).map((g) => ({
            value: g,
            label: g === 'ALL' ? t('match.all') : t(`marketGroups.${g}`),
            testId: `market-tab-${g}`,
          }))}
        />
      </div>
      {blocks.length === 0 ? (
        <p className="py-10 text-center text-ink-muted">{t('match.noMarkets')}</p>
      ) : (
        <Reveal className="columns-1 gap-3 2xl:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid" deps={[tab]} stagger={0.03}>
          {blocks.map((b) => (
            <BlockCard key={b.key} block={b} event={event} />
          ))}
        </Reveal>
      )}
    </div>
  );
}
