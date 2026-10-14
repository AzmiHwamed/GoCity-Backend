import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Trip } from './trip.entity';

/** A tip the owner shares with people viewing the trip ("book the tram early"). */
@Entity('trip_tips')
@Index(['tripId', 'position'])
export class TripTip extends BaseEntity {
  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @Column({ length: 500 })
  text: string;

  @Column({ type: 'int' })
  position: number;
}
