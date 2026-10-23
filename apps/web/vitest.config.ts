import { defineConfig } from 'vitest/config';

export default defineConfig({
  // per-package cache: parallel turbo tasks on Windows collide on a shared one
  cacheDir: 'node_modules/.vitest',
  test: { include: ['test/**/*.test.ts'] },
});
