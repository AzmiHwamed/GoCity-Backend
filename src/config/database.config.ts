import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  autoLoadEntities: true,
  // On by default: tables are created/updated from the entities on startup.
  // Set DB_SYNCHRONIZE=false in production and use migrations instead.
  synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  logging: process.env.DB_LOGGING === 'true',
  migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
  migrationsRun: process.env.DB_RUN_MIGRATIONS === 'true',
  charset: 'utf8mb4',
  timezone: 'Z',
}));
