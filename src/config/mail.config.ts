import { registerAs } from '@nestjs/config';

export interface MailConfig {
  /** When empty, emails are only printed to the console (dev mode). */
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export default registerAs('mail', (): MailConfig => ({
  host: process.env.SMTP_HOST || undefined,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || undefined,
  pass: process.env.SMTP_PASS || undefined,
  from: process.env.MAIL_FROM ?? 'NestJS App <no-reply@example.com>',
}));
