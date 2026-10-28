// Vercel Function: every request is rewritten here (see vercel.json) and served by the Nest app,
// bundled into one file during the build (scripts/bundle-serverless.mjs).
export { default } from '../dist-serverless/index.js';
