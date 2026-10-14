import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { InvitationStatus, TripMemberRole } from '../trip.enums';
import { Trip } from './trip.entity';

@Entity('trip_invitations')
@Index(['tripId', 'inviteeEmail'])
@Index(['inviteeEmail', 'status'])
export class TripInvitation extends BaseEntity {
  @ApiProperty({ example: 1 })
  @Column({ name: 'trip_id' })
  tripId: number;

  @ApiPropertyOptional({ type: () => Trip })
  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @ApiProperty({ example: 1 })
  @Column({ name: 'invited_by_id' })
  invitedById: number;

  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy?: Relation<User>;

  /** Set when the invitee has an account (now, or once they accept after signing up). */
  @ApiPropertyOptional({ example: 2, nullable: true })
  @Column({ name: 'invitee_user_id', type: 'int', nullable: true })
  inviteeUserId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'invitee_user_id' })
  inviteeUser?: Relation<User> | null;

  @ApiProperty({ example: 'friend@example.com' })
  @Column({ name: 'invitee_email', length: 255 })
  inviteeEmail: string;

  @ApiProperty({ enum: [TripMemberRole.EDITOR, TripMemberRole.VIEWER] })
  @Column({ type: 'enum', enum: TripMemberRole, default: TripMemberRole.VIEWER })
  role: TripMemberRole;

  @ApiProperty({ enum: InvitationStatus })
  @Column({ type: 'enum', enum: InvitationStatus, default: InvitationStatus.PENDING })
  status: InvitationStatus;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'responded_at', type: 'datetime', nullable: true })
  respondedAt: Date | null;
}
