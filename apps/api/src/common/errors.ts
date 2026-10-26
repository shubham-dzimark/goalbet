import { HttpException, HttpStatus } from '@nestjs/common';
import { type ErrorCode } from '@goalbet/shared';

const DEFAULT_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  TOTP_REQUIRED: HttpStatus.UNAUTHORIZED,
  TOTP_INVALID: HttpStatus.UNAUTHORIZED,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  INVALID_TOKEN: HttpStatus.BAD_REQUEST,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  LAST_SUPER_ADMIN: HttpStatus.CONFLICT,
  SELF_ACTION: HttpStatus.FORBIDDEN,
  PHONE_TAKEN: HttpStatus.CONFLICT,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Business error with a typed code (see packages/shared/src/errors.ts).
 * Serialised by ApiExceptionFilter as { error: { code, message, details } }.
 */
export class DomainError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    status?: number,
    message?: string,
  ) {
    super({ code, details, message: message ?? code }, status ?? DEFAULT_STATUS[code] ?? HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
