import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  RequestMethod,
} from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ApiEnvelope, RESPONSE_TITLE_KEY, statusPhrase } from '../response/api-response';

/** Wraps every successful response in the standard envelope. Errors are wrapped by AllExceptionsFilter. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    const handler = context.getHandler();
    // The status is applied after interceptors run, so work it out the same way Nest does.
    const status =
      this.reflector.get<number>(HTTP_CODE_METADATA, handler) ??
      (this.reflector.get<RequestMethod>(METHOD_METADATA, handler) === RequestMethod.POST
        ? HttpStatus.CREATED
        : HttpStatus.OK);
    const title =
      this.reflector.getAllAndOverride<string>(RESPONSE_TITLE_KEY, [handler, context.getClass()]) ??
      statusPhrase(status);

    return next.handle().pipe(
      map((data) => ({
        status_code: status,
        response_title: title,
        response_body: data ?? null,
        response_error: null,
      })),
    );
  }
}
