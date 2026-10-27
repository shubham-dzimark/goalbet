import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { CoreModule, OddsManagementModule, SettlementEngineModule, WalletLedgerModule, loggerModule } from '@goalbet/api/kit';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [loggerModule, CoreModule, OddsManagementModule, SettlementEngineModule, WalletLedgerModule],
  providers: [JobsService],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void main();
