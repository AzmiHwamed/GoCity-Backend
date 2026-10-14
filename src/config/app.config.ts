import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  /** Public URL of the web app; used to build invite links like <appUrl>/invite/<code>. */
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
}));
