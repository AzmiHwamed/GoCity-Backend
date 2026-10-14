import { INestApplication } from '@nestjs/common';
import { registerAs } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import {
  OperationObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { statusPhrase } from '../common/response/api-response';

export default registerAs('swagger', () => ({
  enabled: process.env.SWAGGER_ENABLED !== 'false',
  path: process.env.SWAGGER_PATH ?? 'docs',
}));

export function setupSwagger(app: INestApplication, path: string): void {
  const config = new DocumentBuilder()
    .setTitle('GoCity Backend API')
    .setDescription(
      'Every JSON response has the same shape:\n\n' +
        '`{ "status_code": number, "response_title": string, "response_body": data | null, "response_error": string | null }`',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = wrapResponsesInEnvelope(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}

const ERROR_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['status_code', 'response_title', 'response_body', 'response_error'],
  properties: {
    status_code: { type: 'integer', example: 400 },
    response_title: { type: 'string', example: 'Bad Request' },
    response_body: { nullable: true, example: null },
    response_error: { type: 'string', example: 'email must be an email; password is too short' },
  },
};

function envelope(status: number, body?: SchemaObject | ReferenceObject): SchemaObject {
  return {
    type: 'object',
    required: ['status_code', 'response_title', 'response_body', 'response_error'],
    properties: {
      status_code: { type: 'integer', example: status },
      response_title: { type: 'string', example: statusPhrase(status) },
      response_body: body ?? { nullable: true, example: null },
      response_error: { type: 'string', nullable: true, example: null },
    },
  };
}

/**
 * The interceptor and the exception filter wrap every response at runtime; this makes the
 * docs match by wrapping each documented response schema the same way.
 */
export function wrapResponsesInEnvelope(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ErrorResponse = ERROR_SCHEMA;
  const errorContent = {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
  };

  for (const pathItem of Object.values(document.paths)) {
    for (const op of Object.values(pathItem) as OperationObject[]) {
      if (!op?.responses) continue;
      for (const [code, response] of Object.entries(op.responses)) {
        const res = response as ResponseObject;
        const status = Number(code);
        if (status >= 400) {
          res.content = errorContent;
        } else if (status >= 200) {
          const body = res.content?.['application/json']?.schema;
          res.content = { 'application/json': { schema: envelope(status, body) } };
        }
      }
      op.responses.default ??= { description: 'Error', content: errorContent };
    }
  }
  return document;
}
