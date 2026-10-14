import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Media } from '../../media/entities/media.entity';

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

  @ApiPropertyOptional({ example: '+447911123456', nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

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
}
