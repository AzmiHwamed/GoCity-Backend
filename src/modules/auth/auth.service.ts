import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Cache } from 'cache-manager';
import { createHash, randomBytes, randomInt } from 'crypto';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { AuthConfig } from '../../config/auth.config';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AuthResponseDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
  VerifyOtpResponseDto,
} from './dto';
import { ClientInfo, TokensService } from './tokens.service';

interface OtpEntry {
  userId: number;
  hash: string;
  attempts: number;
  expiresAt: number;
}

interface ResetEntry {
  userId: number;
  expiresAt: number;
}

export const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, a verification code has been sent.';
export const REGISTRATION_MESSAGE = 'Check your email for the verification code to activate your account.';

const otpKey = (email: string) => `otp:${email}`;
const registrationOtpKey = (email: string) => `registration-otp:${email}`;
// Only a hash of the reset token is used as the key, so a cache dump doesn't leak usable tokens.
const resetKey = (token: string) => `reset:${createHash('sha256').update(token).digest('hex')}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly auth: AuthConfig;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokens: TokensService,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    config: ConfigService,
  ) {
    this.auth = config.getOrThrow<AuthConfig>('auth');
  }

  // ── Register / login ──────────────────────────────────────

  async register(dto: RegisterDto): Promise<MessageResponseDto> {
    const user = await this.usersService.create(dto, false);
    await this.sendRegistrationCode(user);
    return { message: REGISTRATION_MESSAGE };
  }

  async verifyRegistration(dto: VerifyOtpDto, client?: ClientInfo): Promise<AuthResponseDto> {
    const key = registrationOtpKey(dto.email);
    const entry = await this.cache.get<OtpEntry>(key);
    await this.assertOtp(entry, dto.otp, key);
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new BadRequestException('Invalid or expired code');
    await this.cache.del(key);
    return this.issueToken(await this.usersService.activate(user.id), client);
  }

  async login({ email, password }: LoginDto, client?: ClientInfo): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) throw new UnauthorizedException('This account is disabled');
    return this.issueToken(await this.usersService.findOne(user.id), client);
  }

  /**
   * Changes the password and returns a fresh token pair. All other sessions end:
   * older access tokens are rejected and every refresh token is revoked.
   */
  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    client?: ClientInfo,
  ): Promise<AuthResponseDto> {
    await this.usersService.changePassword(userId, dto.currentPassword, dto.newPassword);
    return this.issueToken(await this.usersService.findOne(userId), client);
  }

  refresh(refreshToken: string, client?: ClientInfo): Promise<AuthResponseDto> {
    return this.tokens.refresh(refreshToken, client);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  logoutAll(userId: number): Promise<void> {
    return this.usersService.revokeSessions(userId);
  }

  // ── Password reset, step 1: email a one-time code ─────────

  async forgotPassword(email: string): Promise<MessageResponseDto> {
    const user = await this.usersService.findByEmail(email);
    // Same response whether or not the account exists, so emails can't be enumerated.
    if (!user || !user.isActive) return { message: FORGOT_PASSWORD_MESSAGE };

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMs = this.auth.otpTtlSeconds * 1000;
    const entry: OtpEntry = {
      userId: user.id,
      hash: await bcrypt.hash(code, 10),
      attempts: 0,
      expiresAt: Date.now() + ttlMs,
    };
    await this.cache.set(otpKey(email), entry, ttlMs);

    try {
      await this.mailService.sendPasswordResetCode(
        user.email,
        user.firstName,
        code,
        Math.round(this.auth.otpTtlSeconds / 60),
      );
    } catch (err) {
      // Don't reveal delivery failures to the caller; that would also reveal the account exists.
      this.logger.error(`Failed to send reset code to ${email}`, (err as Error).stack);
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  // ── Step 2: check the code, hand out a reset token ────────

  async verifyOtp({ email, otp }: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    const key = otpKey(email);
    const entry = await this.cache.get<OtpEntry>(key);
    await this.assertOtp(entry, otp, key);

    await this.cache.del(key);
    const resetToken = randomBytes(32).toString('hex');
    const ttlMs = this.auth.resetTokenTtlSeconds * 1000;
    const resetEntry: ResetEntry = { userId: entry!.userId, expiresAt: Date.now() + ttlMs };
    await this.cache.set(resetKey(resetToken), resetEntry, ttlMs);

    return { resetToken, expiresIn: this.auth.resetTokenTtlSeconds };
  }

  // ── Step 3: set the new password ──────────────────────────

  async resetPassword({ resetToken, newPassword }: ResetPasswordDto): Promise<MessageResponseDto> {
    const key = resetKey(resetToken);
    const entry = await this.cache.get<ResetEntry>(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.cache.del(key); // single use
    await this.usersService.setPassword(entry.userId, newPassword);
    return { message: 'Your password has been reset. You can now log in.' };
  }

  // ──────────────────────────────────────────────────────────

  private async issueToken(user: User, client?: ClientInfo): Promise<AuthResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { refreshTokenId, ...tokens } = await this.tokens.issue(user, client);
    return tokens;
  }

  private async sendRegistrationCode(user: User): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMs = this.auth.otpTtlSeconds * 1000;
    await this.cache.set(
      registrationOtpKey(user.email),
      { userId: user.id, hash: await bcrypt.hash(code, 10), attempts: 0, expiresAt: Date.now() + ttlMs },
      ttlMs,
    );
    try {
      await this.mailService.sendEmailVerificationCode(user.email, user.firstName, code, Math.round(this.auth.otpTtlSeconds / 60));
    } catch (err) {
      this.logger.error(`Failed to send verification code to ${user.email}`, (err as Error).stack);
    }
  }

  private async assertOtp(entry: OtpEntry | undefined, otp: string, key: string): Promise<void> {
    if (!entry || entry.expiresAt <= Date.now()) throw new BadRequestException('Invalid or expired code');
    if (entry.attempts >= this.auth.otpMaxAttempts) {
      await this.cache.del(key);
      throw new BadRequestException('Too many attempts, please request a new code');
    }
    if (await bcrypt.compare(otp, entry.hash)) return;
    entry.attempts += 1;
    if (entry.attempts >= this.auth.otpMaxAttempts) {
      await this.cache.del(key);
      throw new BadRequestException('Too many attempts, please request a new code');
    }
    await this.cache.set(key, entry, entry.expiresAt - Date.now());
    throw new BadRequestException('Invalid or expired code');
  }
}
