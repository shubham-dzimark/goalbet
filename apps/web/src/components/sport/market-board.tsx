'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type EventDetailDto, type MarketDto, type MarketGroup, formatLine, marketGroupOf } from '@goalbet/shared';
import { Card, cn } from '@goalbet/ui';
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
  const tableHeads = block.markets[0]?.type === 'ASIAN_HANDICAP' ? [event.homeTeam, event.awayTeam] : null;

  return (
    <Card className="overflow-hidden" data-testid="market-block" data-market-type={block.markets[0]?.type}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-bold hover:bg-card-alt"
        aria-expanded={open}
      >
        {block.title}
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform', !open && '-rotate-90')} aria-hidden="true" />
      </button>
      {!open ? null : block.kind === 'table' ? (
        <div className="border-t border-line">
          {tableHeads ? (
            <div className="grid grid-cols-[72px_1fr_1fr] gap-1.5 px-3 pt-2 text-xs font-semibold text-ink-muted">
              <span />
              <span className="truncate text-center">{tableHeads[0]}</span>
              <span className="truncate text-center">{tableHeads[1]}</span>
            </div>
          ) : null}
          {block.markets.map((m) => (
            <div key={m.id} className="grid grid-cols-[72px_1fr_1fr] items-center gap-1.5 px-3 py-1.5 sm:grid-cols-[minmax(72px,160px)_1fr_1fr]">
              <span className="truncate text-xs font-semibold text-ink-muted">
                {m.type === 'PLAYER_SHOTS' ? `${m.playerName} ${formatLine(m.line ?? 0)}` : formatLine(m.line ?? 0, m.type === 'ASIAN_HANDICAP')}
              </span>
              {m.selections.map((s) => (
                <OddsButton key={s.id} event={event} market={m} selection={s} label={m.type === 'ASIAN_HANDICAP' ? undefined : outcomeShort(m, s, event)} layout="row" />
              ))}
            </div>
          ))}
          <div className="h-1.5" />
        </div>
      ) : block.kind === 'scores' ? (
        <div className="grid grid-cols-3 gap-1.5 border-t border-line p-3 sm:grid-cols-4">
          {block.markets[0]!.selections.map((s) => (
            <OddsButton key={s.id} event={event} market={block.markets[0]!} selection={s} label={outcomeShort(block.markets[0]!, s, event)} />
          ))}
        </div>
      ) : block.kind === 'scorers' ? (
        <div className="grid gap-x-4 border-t border-line p-3 sm:grid-cols-2">
          {(['HOME', 'AWAY'] as const).map((team) => (
            <div key={team} className="space-y-1.5">
              <p className="text-xs font-bold uppercase text-ink-muted">{team === 'HOME' ? event.homeTeam : event.awayTeam}</p>
              {block.markets[0]!.selections
                .filter((s) => s.team === team)
                .map((s) => (
                  <OddsButton key={s.id} event={event} market={block.markets[0]!} selection={s} label={s.label ?? s.outcome} layout="row" />
                ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('grid gap-1.5 border-t border-line p-3', block.markets[0]!.selections.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {block.markets[0]!.selections.map((s) => (
            <OddsButton key={s.id} event={event} market={block.markets[0]!} selection={s} label={outcomeShort(block.markets[0]!, s, event)} layout="row" />
          ))}
        </div>
      )}
    </Card>
  );
}

/** F1.9 / F5.3 — every market group in tabs. */
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
      <div role="tablist" className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
        {(['ALL', ...present] as const).map((g) => (
          <button
            key={g}
            role="tab"
            type="button"
            aria-selected={tab === g}
            onClick={() => setTab(g)}
            data-testid={`market-tab-${g}`}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold',
              tab === g ? 'border-chrome bg-chrome text-chrome-ink' : 'border-line bg-card text-ink-muted hover:text-ink',
            )}
          >
            {g === 'ALL' ? t('match.all') : t(`marketGroups.${g}`)}
          </button>
        ))}
      </div>
      {blocks.length === 0 ? (
        <p className="py-10 text-center text-ink-muted">{t('match.noMarkets')}</p>
      ) : (
        <div className="columns-1 gap-3 2xl:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {blocks.map((b) => (
            <BlockCard key={b.key} block={b} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
