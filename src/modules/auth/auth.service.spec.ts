import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService, FORGOT_PASSWORD_MESSAGE } from './auth.service';
import { TokensService } from './tokens.service';

describe('AuthService', () => {
  let service: AuthService;
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => void store.set(key, value)),
    del: jest.fn(async (key: string) => void store.delete(key)),
  };
  const user = {
    id: 7,
    email: 'jane@example.com',
    firstName: 'Jane',
    role: UserRole.USER,
    isActive: true,
  } as User;
  const usersService = {
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findOne: jest.fn(async () => user),
    setPassword: jest.fn(),
  };
  const mailService = { sendPasswordResetCode: jest.fn() };
  const config = {
    getOrThrow: () => ({
      jwtSecret: 'x'.repeat(32),
      jwtExpiresIn: '1d',
      otpTtlSeconds: 600,
      otpMaxAttempts: 3,
      resetTokenTtlSeconds: 900,
    }),
  };

  /** Runs step 1 and returns the code that was "emailed". */
  const requestCode = async () => {
    usersService.findByEmail.mockResolvedValue(user);
    await service.forgotPassword(user.email);
    return mailService.sendPasswordResetCode.mock.calls.at(-1)[2] as string;
  };
  const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

  beforeEach(async () => {
    jest.clearAllMocks();
    store.clear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: TokensService,
          useValue: {
            issue: jest.fn(async (u: User) => ({
              accessToken: 'jwt-token',
              tokenType: 'Bearer',
              refreshToken: 'refresh-token',
              refreshTokenId: 1,
              user: u,
            })),
          },
        },
        { provide: MailService, useValue: mailService },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('rejects a wrong password', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: await bcrypt.hash('Right1234', 4),
      });
      await expect(
        service.login({ email: user.email, password: 'Wrong1234' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a token for valid credentials', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: await bcrypt.hash('Right1234', 4),
      });
      const res = await service.login({ email: user.email, password: 'Right1234' });
      expect(res).toMatchObject({ accessToken: 'jwt-token', tokenType: 'Bearer', user });
    });
  });

  describe('forgotPassword (step 1)', () => {
    it('returns the generic message and sends nothing for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.forgotPassword('nobody@example.com')).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
      expect(mailService.sendPasswordResetCode).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    });

    it('emails a 6-digit code and caches only its hash', async () => {
      const code = await requestCode();
      expect(code).toMatch(/^\d{6}$/);
      const entry = store.get(`otp:${user.email}`) as { hash: string };
      expect(entry.hash).not.toContain(code);
      expect(await bcrypt.compare(code, entry.hash)).toBe(true);
    });

    it('still returns the generic message when sending the email fails', async () => {
      mailService.sendPasswordResetCode.mockRejectedValueOnce(new Error('SMTP down'));
      usersService.findByEmail.mockResolvedValue(user);
      await expect(service.forgotPassword(user.email)).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
    });
  });

  describe('verifyOtp (step 2)', () => {
    it('returns a reset token for the right code and consumes the code', async () => {
      const code = await requestCode();
      const res = await service.verifyOtp({ email: user.email, otp: code });
      expect(res.resetToken).toMatch(/^[0-9a-f]{64}$/);
      expect(res.expiresIn).toBe(900);
      expect(store.has(`otp:${user.email}`)).toBe(false);
      await expect(service.verifyOtp({ email: user.email, otp: code })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const code = await requestCode();
      await expect(service.verifyOtp({ email: user.email, otp: wrongCode(code) })).rejects.toThrow(
        'Invalid or expired code',
      );
      expect((store.get(`otp:${user.email}`) as { attempts: number }).attempts).toBe(1);
    });

    it('locks the code after too many wrong attempts', async () => {
      const code = await requestCode();
      await expect(
        service.verifyOtp({ email: user.email, otp: wrongCode(code) }),
      ).rejects.toThrow();
      await expect(
        service.verifyOtp({ email: user.email, otp: wrongCode(code) }),
      ).rejects.toThrow();
      await expect(service.verifyOtp({ email: user.email, otp: wrongCode(code) })).rejects.toThrow(
        'Too many attempts',
      );
      // even the right code no longer works
      await expect(service.verifyOtp({ email: user.email, otp: code })).rejects.toThrow(
        'Invalid or expired code',
      );
    });

    it('rejects an expired code', async () => {
      const code = await requestCode();
      (store.get(`otp:${user.email}`) as { expiresAt: number }).expiresAt = Date.now() - 1;
      await expect(service.verifyOtp({ email: user.email, otp: code })).rejects.toThrow(
        'Invalid or expired code',
      );
    });
  });

  describe('resetPassword (step 3)', () => {
    const getResetToken = async () =>
      (await service.verifyOtp({ email: user.email, otp: await requestCode() })).resetToken;

    it('sets the new password and makes the token single-use', async () => {
      const resetToken = await getResetToken();
      await service.resetPassword({ resetToken, newPassword: 'NewPass123' });
      expect(usersService.setPassword).toHaveBeenCalledWith(user.id, 'NewPass123');
      await expect(
        service.resetPassword({ resetToken, newPassword: 'Other1234' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      await expect(
        service.resetPassword({ resetToken: 'a'.repeat(64), newPassword: 'NewPass123' }),
      ).rejects.toThrow('Invalid or expired reset token');
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const resetToken = await getResetToken();
      for (const [key, value] of store) {
        if (key.startsWith('reset:')) (value as { expiresAt: number }).expiresAt = Date.now() - 1;
      }
      await expect(
        service.resetPassword({ resetToken, newPassword: 'NewPass123' }),
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });
});
