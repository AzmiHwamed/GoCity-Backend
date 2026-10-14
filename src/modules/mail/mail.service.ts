import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transporter, createTransport } from 'nodemailer';
import { MailConfig } from '../../config/mail.config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * Sends email over SMTP. When SMTP_HOST is not set, emails are printed to the
 * console instead, so development works without a mail server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logOnly: boolean;

  constructor(config: ConfigService) {
    const mail = config.getOrThrow<MailConfig>('mail');
    this.from = mail.from;
    this.logOnly = !mail.host;
    this.transporter = this.logOnly
      ? createTransport({ jsonTransport: true })
      : createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.secure,
          auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
        });

    if (this.logOnly) {
      this.logger.warn('SMTP_HOST is not set: emails will be logged to the console, not sent');
    }
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
    if (this.logOnly) {
      this.logger.log(
        `[log transport] To: ${message.to} | Subject: ${message.subject}\n${message.text}`,
      );
    }
  }

  sendTripInvitation(params: {
    to: string;
    inviterName: string;
    tripName: string;
    role: string;
    hasAccount: boolean;
    appUrl: string;
  }) {
    const { to, inviterName, tripName, role, hasAccount, appUrl } = params;
    const next = hasAccount
      ? `Log in to accept or decline it: ${appUrl}`
      : `Sign up with this email address (${to}) to accept it: ${appUrl}`;
    const text =
      `${inviterName} invited you to the trip "${tripName}" as ${role}.\n\n` +
      `${next}\n\n` +
      `If you weren't expecting this, you can ignore this email.`;
    const html =
      `<p>${escapeHtml(inviterName)} invited you to the trip ` +
      `<strong>${escapeHtml(tripName)}</strong> as ${escapeHtml(role)}.</p>` +
      `<p>${escapeHtml(next)}</p>` +
      `<p>If you weren't expecting this, you can ignore this email.</p>`;
    return this.send({ to, subject: `You're invited to "${tripName}"`, text, html });
  }

  sendPasswordResetCode(to: string, name: string, code: string, ttlMinutes: number) {
    const text =
      `Hi ${name},\n\n` +
      `Your password reset code is: ${code}\n` +
      `It expires in ${ttlMinutes} minutes.\n\n` +
      `If you did not request a password reset, you can ignore this email.`;
    const html =
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Your password reset code is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>It expires in ${ttlMinutes} minutes.</p>` +
      `<p>If you did not request a password reset, you can ignore this email.</p>`;
    return this.send({ to, subject: 'Your password reset code', text, html });
  }

  sendEmailVerificationCode(to: string, name: string, code: string, ttlMinutes: number) {
    const text =
      `Hi ${name},\n\n` +
      `Your GoCity verification code is: ${code}\n` +
      `It expires in ${ttlMinutes} minutes.\n\n` +
      `If you did not create this account, you can ignore this email.`;
    const html =
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Your GoCity verification code is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>It expires in ${ttlMinutes} minutes.</p>` +
      `<p>If you did not create this account, you can ignore this email.</p>`;
    return this.send({ to, subject: 'Verify your GoCity email', text, html });
  }
}
