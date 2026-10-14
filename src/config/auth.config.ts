import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenTtlDays: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  resetTokenTtlSeconds: number;
}

export default registerAs('auth', (): AuthConfig => ({
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10),
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '600', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  resetTokenTtlSeconds: parseInt(process.env.RESET_TOKEN_TTL_SECONDS ?? '900', 10),
}));
