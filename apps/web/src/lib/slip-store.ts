import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SlipItem {
  selectionId: string;
  eventId: string;
  marketId: string;
  /** Latest known price from the backend. */
  oddsMilli: number;
  /** Price before the last unaccepted change (shown struck through). */
  prevOddsMilli: number | null;
  available: boolean;
  live: boolean;
  eventName: string;
  marketName: string;
  outcomeName: string;
  startTime: string;
}

export type SlipMode = 'single' | 'acca' | 'builder';
export type OddsPref = 'NONE' | 'HIGHER' | 'ANY';

interface SlipState {
  items: SlipItem[];
  mode: SlipMode;
  /** true once the player picked a tab, so we stop auto-switching single ↔ acca */
  modeChosen: boolean;
  singleStakes: Record<string, string>;
  accaStake: string;
  oddsPref: OddsPref;
  sheetOpen: boolean;
  toggle: (item: Omit<SlipItem, 'prevOddsMilli' | 'available'>) => void;
  remove: (selectionId: string) => void;
  clear: () => void;
  removeMany: (ids: string[]) => void;
  setMode: (mode: SlipMode) => void;
  setSingleStake: (selectionId: string, value: string) => void;
  setAccaStake: (value: string) => void;
  setOddsPref: (p: OddsPref) => void;
  setSheetOpen: (open: boolean) => void;
  /** Merge fresh prices/availability from the backend. */
  applyUpdates: (updates: { id: string; oddsMilli: number; available: boolean; live: boolean }[]) => void;
  acceptChanges: () => void;
}

const distinctEvents = (items: SlipItem[]) => new Set(items.map((i) => i.eventId)).size;

function autoMode(s: SlipState, items: SlipItem[]): SlipMode {
  if (s.modeChosen) return s.mode;
  return distinctEvents(items) >= 2 ? 'acca' : 'single';
}

/**
 * F1.12 bet slip — persisted in localStorage so guests keep their selections across pages and
 * reloads. Prices here are display-only; the backend re-checks everything on placement.
 */
export const useSlip = create<SlipState>()(
  persist(
    (set) => ({
      items: [],
      mode: 'single',
      modeChosen: false,
      singleStakes: {},
      accaStake: '10',
      oddsPref: 'HIGHER',
      sheetOpen: false,
      toggle: (item) =>
        set((s) => {
          const exists = s.items.some((i) => i.selectionId === item.selectionId);
          const items = exists
            ? s.items.filter((i) => i.selectionId !== item.selectionId)
            : [...s.items, { ...item, prevOddsMilli: null, available: true }];
          return { items, mode: autoMode(s, items), modeChosen: items.length === 0 ? false : s.modeChosen };
        }),
      remove: (id) =>
        set((s) => {
          const items = s.items.filter((i) => i.selectionId !== id);
          return { items, mode: autoMode(s, items), modeChosen: items.length === 0 ? false : s.modeChosen };
        }),
      removeMany: (ids) =>
        set((s) => {
          const items = s.items.filter((i) => !ids.includes(i.selectionId));
          return { items, mode: autoMode(s, items), modeChosen: items.length === 0 ? false : s.modeChosen };
        }),
      clear: () => set({ items: [], singleStakes: {}, modeChosen: false, mode: 'single' }),
      setMode: (mode) => set({ mode, modeChosen: true }),
      setSingleStake: (id, value) => set((s) => ({ singleStakes: { ...s.singleStakes, [id]: value } })),
      setAccaStake: (accaStake) => set({ accaStake }),
      setOddsPref: (oddsPref) => set({ oddsPref }),
      setSheetOpen: (sheetOpen) => set({ sheetOpen }),
      applyUpdates: (updates) =>
        set((s) => {
          const byId = new Map(updates.map((u) => [u.id, u]));
          let changed = false;
          const items = s.items.map((i) => {
            const u = byId.get(i.selectionId);
            if (!u) return i;
            if (u.oddsMilli === i.oddsMilli && u.available === i.available && u.live === i.live) return i;
            changed = true;
            return {
              ...i,
              prevOddsMilli: u.oddsMilli !== i.oddsMilli ? (i.prevOddsMilli ?? i.oddsMilli) : i.prevOddsMilli,
              oddsMilli: u.oddsMilli,
              available: u.available,
              live: u.live,
            };
          });
          return changed ? { items } : s;
        }),
      acceptChanges: () => set((s) => ({ items: s.items.map((i) => ({ ...i, prevOddsMilli: null })) })),
    }),
    {
      name: 'goalbet-slip',
      storage: createJSONStorage(() => localStorage),
      // rehydrated after mount (AppChrome) so server and first client render match
      skipHydration: true,
      partialize: (s) => ({
        items: s.items,
        mode: s.mode,
        modeChosen: s.modeChosen,
        singleStakes: s.singleStakes,
        accaStake: s.accaStake,
        oddsPref: s.oddsPref,
      }),
    },
  ),
);

export const slipHasConflict = (items: SlipItem[]) => distinctEvents(items) !== items.length;
