import { type OddsMilli } from '@goalbet/shared';
import {
  type BuilderPriceRequest,
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderLiveState,
  type ProviderMarket,
  type ProviderResult,
} from '../odds-provider.js';

/**
 * Starting point for a commercial odds feed (Sportradar, Genius Sports, Kambi, …). Copy this file
 * to `<name>/<name>.provider.ts`, implement each method against the feed, then:
 *   1. add the name to the provider choice in `provider-config.service.ts` (and the admin
 *      Data provider page) and build it in `ProviderRouter.build`;
 *   2. run `test/mock-provider.test.ts`-style contract tests against recorded feed responses.
 *
 * Rules the engine relies on (see docs/DECISIONS.md):
 * - football only; refs are the feed's stable ids, returned as strings;
 * - odds are integer thousandths (`OddsMilli`, 2.150 → 2150); null = no price right now;
 * - market `key` must be `marketKey(spec)` from @goalbet/shared so settlement can rebuild the
 *   market from it; line = goals/corners/cards ×100 (2.5 → 250), handicaps applied to home;
 * - set `suspended` on markets and live states whenever the feed does (goal, VAR, feed issue);
 * - getResult must return the final facts (FT/HT score, corners, cards, player stats) only once
 *   the result is official — settlement pays out on it automatically.
 */
export class TemplateProvider implements OddsProvider {
  readonly name = 'template';
  /** Turn on what the feed supports; the engine falls back to its own formulas otherwise. */
  readonly capabilities = { betBuilderPricing: false, cashOutData: false };

  getCompetitions(): Promise<ProviderCompetition[]> {
    return this.todo('competitions (tournaments) the operator buys');
  }

  getFixtures(_from: Date, _to: Date): Promise<ProviderFixture[]> {
    return this.todo('fixtures with kick-off in [from, to], with squads for player markets');
  }

  getMarkets(_fixtureRef: string): Promise<ProviderMarket[]> {
    return this.todo('pre-match odds, or in-play markets and odds when the fixture is live');
  }

  getLiveStates(): Promise<ProviderLiveState[]> {
    return this.todo('scores, minute and period of live fixtures (and those that just ended)');
  }

  /** Implement when live data is cached between calls, so the feed watchdog sees its real age. */
  liveDataTime(): Promise<number | null> {
    return Promise.resolve(null);
  }

  getResult(_fixtureRef: string): Promise<ProviderResult | null> {
    return this.todo('official final result, or null while not final');
  }

  priceBetBuilder(_fixtureRef: string, _selections: BuilderPriceRequest[]): Promise<OddsMilli | null> {
    // null = the engine prices the combination with builder.factorBps
    return Promise.resolve(null);
  }

  getCashOutValue(_ticketRef: string): Promise<number | null> {
    // null = the engine's cash-out formula (placed ÷ current odds, less the margin)
    return Promise.resolve(null);
  }

  private todo<T>(what: string): Promise<T> {
    return Promise.reject(new Error(`TemplateProvider: implement ${what}`));
  }
}
