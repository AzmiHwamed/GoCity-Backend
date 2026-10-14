import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One issued refresh token. Only a SHA-256 hash is stored. Tokens are rotated on every
 * refresh; all tokens descending from one login share a familyId, so reuse of an old token
 * can revoke the whole chain.
 */
@Entity('refresh_tokens')
@Index(['userId', 'expiresAt'])
export class RefreshToken extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64 })
  tokenHash: string;

  @Index()
  @Column({ name: 'family_id', length: 36 })
  familyId: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'replaced_by_id', type: 'int', nullable: true })
  replacedById: number | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;
}
