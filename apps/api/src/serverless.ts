import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

/**
 * Serverless entry (Vercel Functions): the Nest app is created once per function instance and
 * reused across requests; each request is handed to the underlying Express app.
 * The long-running server stays in main.ts.
 */
let server: Promise<Express> | null = null;

async function bootstrap(): Promise<Express> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, env);
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  server ??= bootstrap().catch((e: unknown) => {
    server = null; // let the next request retry a failed cold start
    throw e;
  });
  const app = await server;
  app(req as never, res as never);
}
