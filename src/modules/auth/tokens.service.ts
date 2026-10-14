import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { AuthConfig } from '../../config/auth.config';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './interfaces/auth-user.interface';

export interface ClientInfo {
  userAgent?: string | null;
  ip?: string | null;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Access tokens are short-lived JWTs. Refresh tokens are random strings stored only as a hash,
 * rotated on every use. Using a token that was already rotated or revoked means it was copied,
 * so the whole family (every token from that login) is revoked.
 */
@Injectable()
export class TokensService {
  private readonly auth: AuthConfig;

  constructor(
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    this.auth = config.getOrThrow<AuthConfig>('auth');
  }

  /** A new access token + refresh token. Pass familyId when rotating, to keep the chain. */
  async issue(
    user: User,
    client: ClientInfo = {},
    familyId: string = randomUUID(),
  ): Promise<AuthResponseDto & { refreshTokenId: number }> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    // Housekeeping: expired tokens of this user are no longer useful, even for reuse detection.
    await this.refreshTokens.delete({ userId: user.id, expiresAt: LessThan(new Date()) });
    const row = await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt,
        revokedAt: null,
        replacedById: null,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ip: client.ip?.slice(0, 45) ?? null,
      }),
    );

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.auth.jwtExpiresIn,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user,
      refreshTokenId: row.id,
    };
  }

  /** Swaps a valid refresh token for a new pair; the old refresh token stops working. */
  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<AuthResponseDto> {
    const row = await this.refreshTokens.findOne({ where: { tokenHash: hashToken(refreshToken) } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('This refresh token was already used. Please log in again.');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired. Please log in again.');
    }

    const user = await this.usersService.findById(row.userId);
    if (!user || !user.isActive) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('This account is not available');
    }

    // Claim the token atomically so two simultaneous refreshes can't both succeed.
    const claimed = await this.refreshTokens.update(
      { id: row.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!claimed.affected) throw new UnauthorizedException('Invalid refresh token');

    const { refreshTokenId, ...tokens } = await this.issue(user, client, row.familyId);
    await this.refreshTokens.update({ id: row.id }, { replacedById: refreshTokenId });
    return tokens;
  }

  /** Logs out one session. Unknown or already revoked tokens are ignored. */
  async revoke(refreshToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: hashToken(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
