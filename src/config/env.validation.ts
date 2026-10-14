import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().default('*'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  GOOGLE_PLACES_API_KEY: Joi.string().allow('').optional(),
  // Optional Firebase Admin service-account JSON. Leave blank to keep FCM disabled.
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().allow('').optional(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_DATABASE: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(true),
  DB_LOGGING: Joi.boolean().default(false),
  DB_RUN_MIGRATIONS: Joi.boolean().default(false),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
  OTP_TTL_SECONDS: Joi.number().integer().min(60).default(600),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  RESET_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).default(900),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().default('NestJS App <no-reply@example.com>'),

  MAX_FILE_SIZE_MB: Joi.number().positive().default(5),
  MAX_TRIP_IMAGES: Joi.number().integer().min(1).default(30),

  ADMIN_EMAIL: Joi.string().email().allow('').optional(),
  ADMIN_PASSWORD: Joi.string().allow('').optional(),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('docs'),
});
