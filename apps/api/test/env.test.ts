import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://x/y',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_ADMIN_SECRET: 'b'.repeat(40),
  COOKIE_SECURE: 'true',
  MOCK_CONTROL_ENABLED: 'false',
} as NodeJS.ProcessEnv;

describe('production configuration guard', () => {
  it('starts with safe settings and warns about demo values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadEnv(base).NODE_ENV).toBe('production');
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/demo bank account/);
    warn.mockRestore();
  });

  it('refuses http cookies, mock controls, example or shared secrets', () => {
    expect(() => loadEnv({ ...base, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv({ ...base, MOCK_CONTROL_ENABLED: 'true' })).toThrow(/MOCK_CONTROL_ENABLED/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'change-me-change-me-change-me-change-me' })).toThrow(/example value/);
    expect(() => loadEnv({ ...base, JWT_ADMIN_SECRET: base['JWT_ACCESS_SECRET'] })).toThrow(/must differ/);
  });

  it('the local docker demo may opt out explicitly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => loadEnv({ ...base, COOKIE_SECURE: 'false', ALLOW_INSECURE_LOCAL: 'true' })).not.toThrow();
    warn.mockRestore();
  });
});
