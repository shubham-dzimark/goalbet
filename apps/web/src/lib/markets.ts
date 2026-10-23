'use client';

import { useTranslations } from 'next-intl';
import { type MarketDto, type MarketType, type SelectionDto, formatLine } from '@goalbet/shared';

interface EventNames {
  homeTeam: string;
  awayTeam: string;
}

const OVER_UNDER: MarketType[] = ['TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'TOTAL_CORNERS', 'TOTAL_CARDS', 'PLAYER_SHOTS'];

/** Human (localised) names for markets and outcomes, shared by match page, slip and My Bets. */
export function useMarketText() {
  const t = useTranslations();

  const line = (m: Pick<MarketDto, 'line'>, signed = false) => (m.line === null ? '' : formatLine(m.line, signed));

  const marketTitle = (m: Pick<MarketDto, 'type' | 'period' | 'line' | 'team' | 'playerName'>, ev: EventNames) => {
    const base = t(`markets.${m.type}`);
    let name = base;
    switch (m.type) {
      case 'TOTAL_GOALS':
      case 'TOTAL_CORNERS':
      case 'TOTAL_CARDS':
        name = t('marketName.line', { name: base, line: line(m) });
        break;
      case 'TEAM_TOTAL_GOALS':
        name = t('marketName.team', { name: t('marketName.line', { name: base, line: line(m) }), team: m.team === 'AWAY' ? ev.awayTeam : ev.homeTeam });
        break;
      case 'EUROPEAN_HANDICAP':
      case 'ASIAN_HANDICAP':
        name = t('marketName.line', { name: base, line: line(m, true) });
        break;
      case 'PLAYER_SHOTS':
        name = t('marketName.player', { name: t('marketName.line', { name: base, line: line(m) }), player: m.playerName ?? '' });
        break;
      default:
        break;
    }
    return m.period === 'H1' ? t('marketName.half', { name }) : name;
  };

  /** Short label for odds buttons in a grid ("1", "X", "Peste 2.5", "2-1", player name). */
  const outcomeShort = (m: Pick<MarketDto, 'type' | 'line'>, s: Pick<SelectionDto, 'outcome' | 'label'>, ev: EventNames) => {
    if (OVER_UNDER.includes(m.type)) {
      return s.outcome === 'OVER' ? t('outcome.over', { line: line(m) }) : t('outcome.under', { line: line(m) });
    }
    switch (m.type) {
      case 'ASIAN_HANDICAP': {
        const l = m.line ?? 0;
        return t('outcome.handicap', {
          side: s.outcome === 'HOME' ? ev.homeTeam : ev.awayTeam,
          line: formatLine(s.outcome === 'HOME' ? l : -l, true),
        });
      }
      case 'CORRECT_SCORE':
        return s.outcome === 'OTHER' ? t('outcome.other') : s.outcome;
      case 'ANYTIME_SCORER':
        return s.label ?? s.outcome;
      default:
        return t.has(`outcomes.${s.outcome}`) ? t(`outcomes.${s.outcome}`) : s.outcome;
    }
  };

  /** Full label for the bet slip / tickets ("Arsenal", "Draw", "Over 2.5", "1X"). */
  const outcomeLong = (m: Pick<MarketDto, 'type' | 'line'>, s: Pick<SelectionDto, 'outcome' | 'label'>, ev: EventNames) => {
    if ((m.type === 'MATCH_RESULT' || m.type === 'EUROPEAN_HANDICAP') && ['HOME', 'DRAW', 'AWAY'].includes(s.outcome)) {
      const name = s.outcome === 'HOME' ? ev.homeTeam : s.outcome === 'AWAY' ? ev.awayTeam : t('outcome.draw');
      return m.type === 'EUROPEAN_HANDICAP' ? `${name} (${line(m, true)})` : name;
    }
    return outcomeShort(m, s, ev);
  };

  return { marketTitle, outcomeShort, outcomeLong };
}
