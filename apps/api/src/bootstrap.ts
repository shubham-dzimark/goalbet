import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { type Env } from './config/env.js';

/** HTTP hardening + docs shared by main.ts and the integration tests. */
export function configureApp(app: INestApplication, env: Env, opts: { logger?: boolean } = {}) {
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  if (opts.logger !== false) app.useLogger(app.get(Logger));

  const http = app.getHttpAdapter().getInstance() as Express;
  http.disable('x-powered-by');
  if (env.TRUST_PROXY) http.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI at /docs needs inline assets; the API itself only serves JSON.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      hsts: env.NODE_ENV === 'production',
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN], credentials: true });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('GoalBet Betting Engine API')
    .setDescription('Football-only sportsbook, RON wallet (integer bani), RO/EN. Errors: { error: { code, message, details } }.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}
