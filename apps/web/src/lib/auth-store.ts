import { create } from 'zustand';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  locale: string;
  status: string;
  oddsChangePreference: 'NONE' | 'HIGHER' | 'ANY';
  /** reality check every N minutes; null = off */
  realityCheckMinutes: number | null;
  balanceBani: number;
  dateOfBirth: string;
  createdAt: string;
}

interface AuthState {
  status: 'loading' | 'guest' | 'authed';
  /** Access token lives in memory only; the refresh token is an httpOnly cookie. */
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (accessToken: string, user: SessionUser) => void;
  setUser: (user: SessionUser) => void;
  setBalance: (balanceBani: number) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authed' }),
  setUser: (user) => set({ user }),
  setBalance: (balanceBani) => set((s) => (s.user ? { user: { ...s.user, balanceBani } } : s)),
  clear: () => {
    // logging out ends the playing session used by the reality check
    try {
      localStorage.removeItem('gb-play-session');
    } catch {
      /* storage unavailable */
    }
    set({ accessToken: null, user: null, status: 'guest' });
  },
}));
