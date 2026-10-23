import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Media } from '../../media/entities/media.entity';
import { Interest } from '../../interests/entities/interest.entity';
import { LegalStatusDto } from '../../legal/dto';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum UserRole {
  USER = 'user',
  ORGANIZATION = 'organization',
  ADMIN = 'admin',
}

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty({ example: 'Jane' })
  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @Index({ unique: true })
  @Column({ length: 255 })
  email: string;

  @Exclude() // never serialized in responses
  @Column({ select: false })
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @ApiPropertyOptional({ example: 'Acme Tours', nullable: true })
  @Column({ name: 'organization_name', type: 'varchar', length: 150, nullable: true })
  organizationName: string | null;

  @ApiPropertyOptional({ example: 'Medina of Tunis', nullable: true })
  @Column({ name: 'organization_location_name', type: 'varchar', length: 255, nullable: true })
  organizationLocationName: string | null;

  @ApiPropertyOptional({ example: 36.8065, nullable: true })
  @Column({
    name: 'organization_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  organizationLatitude: number | null;

  @ApiPropertyOptional({ example: 10.1815, nullable: true })
  @Column({
    name: 'organization_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  organizationLongitude: number | null;

  @ApiPropertyOptional({
    example: 'PAR',
    nullable: true,
    description: 'IATA city or airport code the user usually flies from (for trip flight search)',
  })
  @Column({ name: 'home_airport_code', type: 'varchar', length: 3, nullable: true })
  homeAirportCode: string | null;

  @ApiPropertyOptional({ example: '+447911123456', nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'I enjoy finding local food and quiet walks.' })
  @Column({ name: 'about_me', type: 'text', nullable: true })
  aboutMe: string | null;

  @ApiPropertyOptional({ type: () => [Interest] })
  @ManyToMany(() => Interest, { eager: true })
  @JoinTable({
    name: 'user_interests',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'interest_id', referencedColumnName: 'id' },
  })
  interests?: Relation<Interest>[];

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Tokens issued before this moment are rejected (set on password change/reset). */
  @Exclude()
  @Column({ name: 'password_changed_at', type: 'datetime', precision: 6, nullable: true })
  passwordChangedAt: Date | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  @Column({ name: 'avatar_id', type: 'int', nullable: true })
  avatarId: number | null;

  @ApiPropertyOptional({ type: () => Media, nullable: true })
  @ManyToOne(() => Media, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'avatar_id' })
  avatar?: Relation<Media> | null;

  // ── Accepted terms / privacy versions (exposed only through `legal` on /me) ──
  @Exclude()
  @Column({ name: 'accepted_terms_version', type: 'varchar', length: 20, nullable: true })
  acceptedTermsVersion: string | null;

  @Exclude()
  @Column({ name: 'accepted_terms_at', type: 'datetime', nullable: true })
  acceptedTermsAt: Date | null;

  @Exclude()
  @Column({ name: 'accepted_privacy_version', type: 'varchar', length: 20, nullable: true })
  acceptedPrivacyVersion: string | null;

  @Exclude()
  @Column({ name: 'accepted_privacy_at', type: 'datetime', nullable: true })
  acceptedPrivacyAt: Date | null;

  /** Only on /auth/me and /users/me: accepted vs current terms and privacy versions. */
  @ApiPropertyOptional({ type: () => LegalStatusDto })
  legal?: LegalStatusDto;

  /** Profile statistics, populated only for full profile responses. */
  @ApiPropertyOptional({ example: 4 }) tripCount?: number;
  @ApiPropertyOptional({ example: 12 }) savedCount?: number;
  @ApiPropertyOptional({ example: 2 }) sharedTripCount?: number;
}
