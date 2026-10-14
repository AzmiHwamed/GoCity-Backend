import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokensService, hashToken } from './tokens.service';

/** Tiny in-memory refresh_tokens table that understands the few queries TokensService makes. */
function fakeTable() {
  let rows: RefreshToken[] = [];
  let seq = 0;
  const matches = (r: RefreshToken, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const value = (r as unknown as Record<string, unknown>)[k];
      if (v instanceof FindOperator) {
        if (v.type === 'isNull') return value === null;
        if (v.type === 'lessThan') return (value as Date) < (v.value as Date);
      }
      return value === v;
    });
  return {
    get rows() {
      return rows;
    },
    create: (d: Partial<RefreshToken>) => Object.assign(new RefreshToken(), d),
    save: jest.fn(async (r: RefreshToken) => {
      r.id = ++seq;
      rows.push(r);
      return r;
    }),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => matches(r, where)) ?? null,
    ),
    update: jest.fn(async (where: Record<string, unknown>, set: Partial<RefreshToken>) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, set));
      return { affected: hit.length };
    }),
    delete: jest.fn(async (where: Record<string, unknown>) => {
      rows = rows.filter((r) => !matches(r, where));
    }),
  };
}

describe('TokensService (refresh tokens)', () => {
  let service: TokensService;
  let table: ReturnType<typeof fakeTable>;
  const user = Object.assign(new User(), {
    id: 7,
    email: 'jane@x.com',
    role: UserRole.USER,
    isActive: true,
  });
  const usersService = { findById: jest.fn() };

  beforeEach(async () => {
    table = fakeTable();
    usersService.findById.mockResolvedValue(user);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokensService,
        { provide: getRepositoryToken(RefreshToken), useValue: table },
        { provide: JwtService, useValue: { signAsync: jest.fn(async () => 'access-jwt') } },
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => ({ jwtExpiresIn: '15m', refreshTokenTtlDays: 30 }) },
        },
      ],
    }).compile();
    service = moduleRef.get(TokensService);
  });

  it('issues an opaque refresh token and stores only its hash', async () => {
    const res = await service.issue(user, { userAgent: 'Firefox', ip: '1.2.3.4' });
    expect(res).toMatchObject({ accessToken: 'access-jwt', expiresIn: '15m', user });
    expect(res.refreshToken).toMatch(/^[\w-]{64}$/);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      userId: 7,
      tokenHash: hashToken(res.refreshToken),
      userAgent: 'Firefox',
      ip: '1.2.3.4',
      revokedAt: null,
    });
    expect(JSON.stringify(table.rows)).not.toContain(res.refreshToken);
    const days = (res.refreshTokenExpiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('rotates: returns a new pair and the old refresh token stops working', async () => {
    const first = await service.issue(user);
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toBe('access-jwt');

    const [old, current] = table.rows;
    expect(old.revokedAt).toBeInstanceOf(Date);
    expect(old.replacedById).toBe(current.id);
    expect(current.familyId).toBe(old.familyId);
    expect(current.revokedAt).toBeNull();
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('reusing an old token revokes the whole family (stolen token)', async () => {
    const first = await service.issue(user);
    const second = await service.refresh(first.refreshToken);
    const otherLogin = await service.issue(user);

    await expect(service.refresh(first.refreshToken)).rejects.toThrow('already used');
    // the attacker and the real user both have to log in again on that login...
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // ...but other logins (another device) keep working
    await expect(service.refresh(otherLogin.refreshToken)).resolves.toBeDefined();
  });

  it('rejects unknown and expired tokens', async () => {
    await expect(service.refresh('nope')).rejects.toThrow('Invalid refresh token');
    const t = await service.issue(user);
    table.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.refresh(t.refreshToken)).rejects.toThrow('expired');
  });

  it('rejects disabled or deleted users and ends that login', async () => {
    const t = await service.issue(user);
    usersService.findById.mockResolvedValueOnce({ ...user, isActive: false });
    await expect(service.refresh(t.refreshToken)).rejects.toThrow('not available');
    expect(table.rows[0].revokedAt).toBeInstanceOf(Date);

    const t2 = await service.issue(user);
    usersService.findById.mockResolvedValueOnce(null);
    await expect(service.refresh(t2.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes just that token', async () => {
    const a = await service.issue(user);
    const b = await service.issue(user);
    await service.revoke(a.refreshToken);
    await expect(service.refresh(a.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(b.refreshToken)).resolves.toBeDefined();
    await expect(service.revoke('unknown')).resolves.toBeUndefined();
  });

  it('cleans up expired tokens of the user when issuing', async () => {
    await service.issue(user);
    table.rows[0].expiresAt = new Date(Date.now() - 1000);
    await service.issue(user);
    expect(table.rows).toHaveLength(1);
  });
});
