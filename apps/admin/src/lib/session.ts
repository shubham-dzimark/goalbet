import { create } from 'zustand';
import { type ErrorCode, isApiErrorBody } from '@goalbet/shared';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE';
  locale: string;
}

interface SessionState {
  status: 'loading' | 'guest' | 'authed';
  accessToken: string | null;
  admin: AdminProfile | null;
  /** Set when the server ended the session for inactivity (F3.1 session timeout). */
  expired: boolean;
  setSession: (accessToken: string, admin: AdminProfile) => void;
  clear: (expired?: boolean) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  accessToken: null,
  admin: null,
  expired: false,
  setSession: (accessToken, admin) => set({ accessToken, admin, status: 'authed', expired: false }),
  clear: (expired = false) => set({ accessToken: null, admin: null, status: 'guest', expired }),
}));

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/admin/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const expired = isApiErrorBody(body) && body.error.code === 'SESSION_EXPIRED';
        useSession.getState().clear(expired);
        return false;
      }
      const { accessToken, admin } = body as { accessToken: string; admin: AdminProfile };
      useSession.getState().setSession(accessToken, admin);
      return true;
    } catch {
      useSession.getState().clear();
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/** Admin API client (same-origin /api proxy). A server-side session timeout logs the operator out. */
export async function adminApi<T>(
  path: string,
  opts: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const token = useSession.getState().accessToken;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = isApiErrorBody(body) ? new ApiError(body.error.code, res.status, body.error.details) : new ApiError('INTERNAL', res.status);
    if (res.status === 401 && token) {
      if (err.code === 'SESSION_EXPIRED') {
        useSession.getState().clear(true);
        throw err;
      }
      if (opts.retry !== false && (await refreshSession())) return adminApi<T>(path, { ...opts, retry: false });
    }
    throw err;
  }
  return body as T;
}
