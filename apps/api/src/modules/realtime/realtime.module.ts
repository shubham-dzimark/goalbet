import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';

/** WebSocket push for always-on hosts (serverless hosts keep HTTP polling). */
@Module({ providers: [RealtimeGateway] })
export class RealtimeModule {}
