import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenKeys, keyParity } from '@goalbet/shared';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const load = (file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const shared = (l: string) => JSON.parse(readFileSync(join(root, '../../packages/shared/i18n', `${l}.json`), 'utf8'));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('F5.7 / F0.3 admin i18n', () => {
  const ro = { ...shared('ro'), ...load('messages/ro.json') };
  const en = { ...shared('en'), ...load('messages/en.json') };

  it('ro.json and en.json have the same keys', () => {
    expect(keyParity(load('messages/ro.json'), load('messages/en.json'))).toEqual({ missingInA: [], missingInB: [] });
  });

  it('every static translation key used in the code exists', () => {
    const keys = new Set(flattenKeys(en));
    const missing: string[] = [];
    for (const file of sources(join(root, 'src'))) {
      const code = readFileSync(file, 'utf8');
      // useTranslations('ns') / getTranslations({ namespace: 'ns' }) + t('key')
      const ns = [...code.matchAll(/(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace:\s*)?'([\w.]+)'/g)].map((m) => m[1]);
      const calls = [...code.matchAll(/\bt[a-z]?\(\s*'([\w.]+)'/g)].map((m) => m[1]!);
      for (const k of calls) {
        const candidates = [k, ...ns.map((n) => `${n}.${k}`)];
        if (!candidates.some((c) => keys.has(c) || [...keys].some((x) => x.startsWith(`${c}.`)))) missing.push(`${file}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(ro).length).toBe(Object.keys(en).length);
  });
});
