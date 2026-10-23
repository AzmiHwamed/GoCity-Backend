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
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { AuthConfig } from '../../config/auth.config';
import { MailService } from '../mail/mail.service';
import { LegalService } from '../legal/legal.service';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AuthResponseDto,
  LoginDto,
  OrganizationRegisterDto,
  RegisterDto,
  ResetPasswordDto,
  SocialLoginDto,
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
export const REGISTRATION_MESSAGE =
  'Check your email for the verification code to activate your account.';

const otpKey = (email: string) => `otp:${email}`;
const registrationOtpKey = (email: string) => `registration-otp:${email}`;
// Only a hash of the reset token is used as the key, so a cache dump doesn't leak usable tokens.
const resetKey = (token: string) => `reset:${createHash('sha256').update(token).digest('hex')}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly auth: AuthConfig;
  private readonly firebaseEnabled: boolean;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokens: TokensService,
    private readonly mailService: MailService,
    private readonly legal: LegalService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    config: ConfigService,
  ) {
    this.auth = config.getOrThrow<AuthConfig>('auth');
    const serviceAccount = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    try {
      if (serviceAccount && !getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
      this.firebaseEnabled = !!serviceAccount;
    } catch {
      this.firebaseEnabled = false;
    }
  }

  // ── Register / login ──────────────────────────────────────

  async register({ acceptTerms, ...dto }: RegisterDto): Promise<MessageResponseDto> {
    const user = await this.usersService.create(dto, false);
    if (acceptTerms) await this.legal.accept(user.id);
    await this.sendRegistrationCode(user);
    return { message: REGISTRATION_MESSAGE };
  }

  async registerOrganization({
    acceptTerms,
    ...dto
  }: OrganizationRegisterDto): Promise<MessageResponseDto> {
    const user = await this.usersService.create({ ...dto, role: UserRole.ORGANIZATION }, false);
    if (acceptTerms) await this.legal.accept(user.id);
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

  /** Verifies a provider token server-side before issuing the normal GoCity token pair. */
  async oauthLogin(dto: SocialLoginDto, client?: ClientInfo): Promise<AuthResponseDto> {
    const profile = dto.firebaseIdToken
      ? await this.firebaseProfile(dto.provider, dto.firebaseIdToken)
      : dto.provider === 'google'
        ? await this.googleProfile(dto.googleIdToken)
        : await this.facebookProfile(dto.facebookAccessToken);
    let user = await this.usersService.findByEmail(profile.email);
    if (!user) {
      if (!dto.acceptTerms) {
        throw new BadRequestException('Accept the Terms of Use and Privacy Policy to create an account');
      }
      user = await this.usersService.create({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        // A random unusable password keeps the existing user schema and password-login policy intact.
        password: randomBytes(32).toString('hex'),
      });
      await this.legal.accept(user.id);
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

  private async firebaseProfile(provider: 'google' | 'facebook', idToken: string) {
    if (!this.firebaseEnabled) throw new UnauthorizedException('Firebase sign-in is unavailable');
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      const actualProvider = decoded.firebase?.sign_in_provider;
      const expectedProvider = provider === 'google' ? 'google.com' : 'facebook.com';
      // Facebook tokens commonly omit email_verified. Firebase has already verified the signed
      // identity and provider here; Google still supplies its verified-email assertion.
      if (
        actualProvider !== expectedProvider ||
        !decoded.email ||
        (provider === 'google' && decoded.email_verified !== true)
      ) {
        throw new UnauthorizedException('Invalid Firebase identity');
      }
      return this.profile(decoded.email, decoded.name, undefined);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }

  private async googleProfile(idToken?: string) {
    if (!idToken || !this.auth.googleClientId) throw new UnauthorizedException('Google sign-in is unavailable');
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    const data = (await response.json().catch(() => null)) as Record<string, string> | null;
    if (
      !response.ok ||
      !data ||
      data.aud !== this.auth.googleClientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(data.iss) ||
      data.email_verified !== 'true' ||
      !data.email
    ) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return this.profile(data.email, data.given_name ?? data.name, data.family_name);
  }

  private async facebookProfile(accessToken?: string) {
    if (!accessToken || !this.auth.facebookAppId || !this.auth.facebookAppSecret) {
      throw new UnauthorizedException('Facebook sign-in is unavailable');
    }
    const appToken = `${this.auth.facebookAppId}|${this.auth.facebookAppSecret}`;
    const debug = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
    );
    const debugData = (await debug.json().catch(() => null)) as { data?: { app_id?: string; is_valid?: boolean } } | null;
    if (!debug.ok || !debugData?.data?.is_valid || debugData.data.app_id !== this.auth.facebookAppId) {
      throw new UnauthorizedException('Invalid Facebook token');
    }
    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,first_name,last_name,email&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = (await response.json().catch(() => null)) as Record<string, string> | null;
    if (!response.ok || !data?.email) throw new UnauthorizedException('Facebook did not provide an email address');
    return this.profile(data.email, data.first_name ?? data.name, data.last_name);
  }

  private profile(email: string, firstName?: string, lastName?: string) {
    const parts = (firstName ?? '').trim().split(/\s+/);
    return {
      email: email.trim().toLowerCase(),
      firstName: parts[0] || 'Traveller',
      lastName: ((lastName ?? parts.slice(1).join(' ')) || 'User').trim(),
    };
  }

  private async sendRegistrationCode(user: User): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMs = this.auth.otpTtlSeconds * 1000;
    await this.cache.set(
      registrationOtpKey(user.email),
      {
        userId: user.id,
        hash: await bcrypt.hash(code, 10),
        attempts: 0,
        expiresAt: Date.now() + ttlMs,
      },
      ttlMs,
    );
    try {
      await this.mailService.sendEmailVerificationCode(
        user.email,
        user.firstName,
        code,
        Math.round(this.auth.otpTtlSeconds / 60),
      );
    } catch (err) {
      this.logger.error(`Failed to send verification code to ${user.email}`, (err as Error).stack);
    }
  }

  private async assertOtp(entry: OtpEntry | undefined, otp: string, key: string): Promise<void> {
    if (!entry || entry.expiresAt <= Date.now())
      throw new BadRequestException('Invalid or expired code');
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
