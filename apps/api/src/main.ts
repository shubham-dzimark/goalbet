import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

async function main() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, env);
  await app.listen(env.PORT, '0.0.0.0');
}

void main();
