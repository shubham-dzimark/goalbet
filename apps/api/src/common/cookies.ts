import type { CookieOptions, Response } from 'express';
import { type Env } from '../config/env.js';

export const USER_REFRESH_COOKIE = 'gb_rt';
export const ADMIN_REFRESH_COOKIE = 'gb_admin_rt';

function options(env: Env, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    // The frontends proxy the API under /api, so scope the cookie to the whole origin.
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

export function setRefreshCookie(res: Response, env: Env, name: string, token: string, expires: Date) {
  res.cookie(name, token, options(env, expires));
}

export function clearRefreshCookie(res: Response, env: Env, name: string) {
  res.clearCookie(name, options(env));
}
