import { type ErrorCode, isApiErrorBody } from '@goalbet/shared';
import { type SessionUser, useAuth } from './auth-store';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }

  /** Field → i18n key map for VALIDATION_FAILED responses. */
  get fields(): Record<string, string> {
    return (this.details?.['fields'] as Record<string, string> | undefined) ?? {};
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Retry once after refreshing the session on 401 (default true). */
  retry?: boolean;
  signal?: AbortSignal;
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh so parallel 401s (or tabs) do not race the refresh-token rotation. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) {
        useAuth.getState().clear();
        return false;
      }
      const body = (await res.json()) as { accessToken: string; user: SessionUser };
      useAuth.getState().setSession(body.accessToken, body.user);
      return true;
    } catch {
      useAuth.getState().clear();
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/** Calls the API through the same-origin /api proxy (see next.config.ts). */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    signal: opts.signal ?? null,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });

  if (res.status === 401 && token && opts.retry !== false) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiErrorBody(body)) throw new ApiError(body.error.code, res.status, body.error.details);
    throw new ApiError('INTERNAL', res.status);
  }
  return body as T;
}

/**
 * Random v4 UUID for Idempotency-Key. `crypto.randomUUID` exists only on secure origins (HTTPS or
 * localhost); on plain HTTP (e.g. a bare-IP server) the same UUID is built from getRandomValues,
 * which every browser offers on any origin.
 */
export function newIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
