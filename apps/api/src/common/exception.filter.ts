import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';
import { type ApiErrorBody, type ErrorCode } from '@goalbet/shared';
import { DomainError } from './errors.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

/** Every error leaves the API as { error: { code, message, details? } }. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Internal error' } };

    if (exception instanceof DomainError) {
      status = exception.getStatus();
      body = {
        error: {
          code: exception.code,
          message: exception.code,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      body = { error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = STATUS_CODES[status] ?? 'INTERNAL';
      body = { error: { code, message: exception.message } };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      Sentry.captureException(exception);
    }

    res.status(status).json(body);
  }
}
