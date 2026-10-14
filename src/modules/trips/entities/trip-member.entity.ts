import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { TripMemberRole } from '../trip.enums';
import { Trip } from './trip.entity';

@Entity('trip_members')
@Index(['tripId', 'userId'], { unique: true })
export class TripMember extends BaseEntity {
  @ApiProperty({ example: 1 })
  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, (trip) => trip.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @ApiProperty({ example: 2 })
  @Column({ name: 'user_id' })
  userId: number;

  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @ApiProperty({ enum: TripMemberRole, example: TripMemberRole.EDITOR })
  @Column({ type: 'enum', enum: TripMemberRole, default: TripMemberRole.VIEWER })
  role: TripMemberRole;
}
