// Bundles the serverless entry (dist/serverless.js) into one ESM file for Vercel Functions.
// Some Nest packages (@nestjs/throttler, nestjs-pino) are CommonJS and require() the ESM-only
// @nestjs/common 12; Vercel's function loader does not allow require() of ES modules, so these
// imports are resolved here, at build time.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/serverless.js'],
  outfile: 'dist-serverless/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'linked',
  logLevel: 'warning',
  // the CommonJS code in the bundle still calls require() for Node built-ins
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: [
    // native packages: loaded from node_modules at run time
    '@node-rs/argon2',
    'pg-native',
    // optional Nest / socket.io / pino peers this app does not install
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@fastify/*',
    'class-transformer',
    'class-transformer/*',
    'class-validator',
    'bufferutil',
    'utf-8-validate',
    'pino-pretty',
    // Swagger UI serves its static files from this package's folder
    'swagger-ui-dist',
    'swagger-ui-dist/*',
  ],
});
