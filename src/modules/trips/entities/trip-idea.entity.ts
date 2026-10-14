import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IdeaStatus, VoteValue } from '../trip.enums';
import { ActivityDetails } from './activity-details';
import { IdeaVote } from './idea-vote.entity';
import { TripActivity } from './trip-activity.entity';
import { Trip } from './trip.entity';

/** A proposed activity that members vote on; becomes a TripActivity when the majority says yes. */
@Entity('trip_ideas')
@Index(['tripId', 'status'])
export class TripIdea extends ActivityDetails {
  @ApiProperty({ example: 1 })
  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @ApiPropertyOptional({ example: 2, nullable: true })
  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: Relation<User> | null;

  @ApiProperty({ enum: IdeaStatus, example: IdeaStatus.OPEN })
  @Column({ type: 'enum', enum: IdeaStatus, default: IdeaStatus.OPEN })
  status: IdeaStatus;

  @ApiPropertyOptional({ example: 7, nullable: true, description: 'Set once accepted' })
  @Column({ name: 'activity_id', type: 'int', nullable: true })
  activityId: number | null;

  @ManyToOne(() => TripActivity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'activity_id' })
  activity?: Relation<TripActivity> | null;

  @Exclude()
  @OneToMany(() => IdeaVote, (vote) => vote.idea)
  votes?: Relation<IdeaVote>[];

  // ── Response-only fields, filled in by TripIdeasService ──

  @ApiPropertyOptional({ example: 2 })
  yesCount?: number;

  @ApiPropertyOptional({ example: 1 })
  noCount?: number;

  @ApiPropertyOptional({ example: 4, description: 'Members who can vote' })
  memberCount?: number;

  @ApiPropertyOptional({ enum: VoteValue, nullable: true })
  myVote?: VoteValue | null;
}
