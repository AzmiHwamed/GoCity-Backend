import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { MEDIA_URL_PREFIX, UPLOAD_DIR } from './modules/media/media.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Allows frontend apps on another origin to display uploaded images.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Required when accessing Swagger through http://IP:PORT.
      // Otherwise Swagger assets are upgraded to unavailable HTTPS URLs.
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  app.enableCors({
    origin: config.get<string>('app.corsOrigin'),
  });

  app.setGlobalPrefix(config.get<string>('app.apiPrefix', 'api'));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Uploaded files: public/uploads/<name> is served at /files/<name>.
  mkdirSync(UPLOAD_DIR, { recursive: true });
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: `${MEDIA_URL_PREFIX}/`,
    index: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  if (config.get<boolean>('swagger.enabled')) {
    setupSwagger(app, config.get<string>('swagger.path', 'docs'));
  }

  const port = config.get<number>('app.port', 3000);
  await app.listen(port);

  logger.log(`Server running on http://localhost:${port}`);

  if (config.get<boolean>('swagger.enabled')) {
    logger.log(`Swagger docs at http://localhost:${port}/${config.get('swagger.path')}`);
  }
}

bootstrap();
