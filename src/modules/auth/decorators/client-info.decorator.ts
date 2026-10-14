import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { ClientInfo } from '../tokens.service';

/** User agent and IP of the caller, stored with refresh tokens so sessions can be told apart. */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { userAgent: req.headers['user-agent'] ?? null, ip: req.ip ?? null };
});
