import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiEnvelope, statusPhrase } from '../response/api-response';

/**
 * Catches every exception (validation, guards, upload limits, unknown routes, database
 * errors, crashes) and returns the standard envelope with response_body = null.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error'; // never expose internals of unexpected errors

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      message = Array.isArray(raw) ? raw.join('; ') : String(raw);
    } else if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string } })
        .driverError;
      if (driverError?.code === 'ER_DUP_ENTRY') {
        status = HttpStatus.CONFLICT;
        message = 'A record with the same unique value already exists';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiEnvelope<null> = {
      status_code: status,
      response_title: statusPhrase(status),
      response_body: null,
      response_error: message,
    };
    res.status(status).json(payload);
  }
}
