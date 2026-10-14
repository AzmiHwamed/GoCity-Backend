import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { ResponseTitle, statusPhrase } from './api-response';

@Controller()
class SampleController {
  @Get() @ResponseTitle('Trip fetched') get() {}
  @Get() untitled() {}
  @Post() create() {}
  @Post() @HttpCode(HttpStatus.OK) login() {}
  @Delete() @HttpCode(HttpStatus.OK) remove() {}
}

describe('Response envelope', () => {
  describe('TransformInterceptor', () => {
    const interceptor = new TransformInterceptor(new Reflector());
    const run = (method: keyof SampleController, data: unknown) =>
      lastValueFrom(
        interceptor.intercept(
          {
            getHandler: () => SampleController.prototype[method],
            getClass: () => SampleController,
          } as never,
          { handle: () => of(data) },
        ),
      );

    it('wraps data with the title from @ResponseTitle', async () => {
      await expect(run('get', { id: 1 })).resolves.toEqual({
        status_code: 200,
        response_title: 'Trip fetched',
        response_body: { id: 1 },
        response_error: null,
      });
    });

    it('falls back to the status phrase', async () => {
      await expect(run('untitled', [])).resolves.toMatchObject({
        status_code: 200,
        response_title: 'OK',
      });
    });

    it('uses 201 for POST unless @HttpCode says otherwise', async () => {
      await expect(run('create', {})).resolves.toMatchObject({
        status_code: 201,
        response_title: 'Created',
      });
      await expect(run('login', {})).resolves.toMatchObject({ status_code: 200 });
    });

    it('returns response_body null when the handler returns nothing', async () => {
      await expect(run('remove', undefined)).resolves.toEqual({
        status_code: 200,
        response_title: 'OK',
        response_body: null,
        response_error: null,
      });
    });
  });

  describe('AllExceptionsFilter', () => {
    const filter = new AllExceptionsFilter();
    const send = (exception: unknown) => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const host = {
        switchToHttp: () => ({
          getResponse: () => res,
          getRequest: () => ({ method: 'GET', url: '/x' }),
        }),
      };
      jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
      filter.catch(exception, host as never);
      return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
    };

    it('joins validation messages into one string', () => {
      const { status, body } = send(
        new BadRequestException(['email must be an email', 'password is too short']),
      );
      expect(status).toBe(400);
      expect(body).toEqual({
        status_code: 400,
        response_title: 'Bad Request',
        response_body: null,
        response_error: 'email must be an email; password is too short',
      });
    });

    it.each([
      [new UnauthorizedException(), 401, 'Unauthorized', 'Unauthorized'],
      [new ForbiddenException('Owners only'), 403, 'Forbidden', 'Owners only'],
      [new NotFoundException('Trip #1 not found'), 404, 'Not Found', 'Trip #1 not found'],
    ])('maps %p', (exception, code, title, error) => {
      expect(send(exception).body).toEqual({
        status_code: code,
        response_title: title,
        response_body: null,
        response_error: error,
      });
    });

    it('hides the details of unexpected errors (500)', () => {
      const { status, body } = send(new Error('connect ECONNREFUSED 10.0.0.5:3306'));
      expect(status).toBe(500);
      expect(body).toEqual({
        status_code: 500,
        response_title: 'Internal Server Error',
        response_body: null,
        response_error: 'Internal server error',
      });
    });

    it('turns duplicate keys into 409', () => {
      const err = new QueryFailedError('INSERT', [], new Error('dup'));
      (err as unknown as { driverError: { code: string } }).driverError = { code: 'ER_DUP_ENTRY' };
      expect(send(err).body).toMatchObject({ status_code: 409, response_title: 'Conflict' });
    });
  });

  it('statusPhrase', () => {
    expect(statusPhrase(413)).toBe('Payload Too Large');
    expect(statusPhrase(415)).toBe('Unsupported Media Type');
    expect(statusPhrase(200)).toBe('OK');
    expect(statusPhrase(414)).toBe('URI Too Long');
  });
});
