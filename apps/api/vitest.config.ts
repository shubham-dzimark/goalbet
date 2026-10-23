import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // NestJS DI needs emitDecoratorMetadata, which esbuild does not support.
    swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2022', transform: { decoratorMetadata: true, legacyDecorator: true } } }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // One shared database: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
