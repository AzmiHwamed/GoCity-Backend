import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Trip } from './trip.entity';
import { TripActivity } from './trip-activity.entity';
import { TripIdea } from './trip-idea.entity';

/** A persistent message posted by a member to a trip's private chat. */
@Entity('trip_messages')
@Index(['tripId', 'createdAt'])
export class TripMessage extends BaseEntity {
  @ApiProperty({ example: 12 })
  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @ApiPropertyOptional({ example: 4, nullable: true })
  @Column({ name: 'author_id', type: 'int', nullable: true })
  authorId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: Relation<User> | null;

  @ApiProperty({ example: 'Should we book the 10am museum slot?' })
  @Column({ type: 'varchar', length: 2000 })
  content: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'shared_trip_id', type: 'int', nullable: true })
  sharedTripId: number | null;

  @ManyToOne(() => Trip, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shared_trip_id' })
  sharedTrip?: Relation<Trip> | null;

  @ApiPropertyOptional({ nullable: true, description: 'An activity from this trip suggested in the chat' })
  @Column({ name: 'shared_activity_id', type: 'int', nullable: true })
  sharedActivityId: number | null;

  @ManyToOne(() => TripActivity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shared_activity_id' })
  sharedActivity?: Relation<TripActivity> | null;

  @ApiPropertyOptional({ nullable: true, description: 'An idea proposed for this trip' })
  @Column({ name: 'shared_idea_id', type: 'int', nullable: true })
  sharedIdeaId: number | null;

  @ManyToOne(() => TripIdea, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shared_idea_id' })
  sharedIdea?: Relation<TripIdea> | null;
}
