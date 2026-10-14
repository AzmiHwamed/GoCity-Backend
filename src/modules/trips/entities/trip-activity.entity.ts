import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ActivityDetails } from './activity-details';
import { Trip } from './trip.entity';

/** An activity or plan on a given day of a trip. */
@Entity('trip_activities')
@Index(['tripId', 'dayNumber', 'startTime'])
export class TripActivity extends ActivityDetails {
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
}
