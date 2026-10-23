import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** The last time a member opened a trip chat, used to calculate unread messages. */
@Entity('trip_chat_reads')
@Index(['tripId', 'userId'], { unique: true })
export class TripChatRead extends BaseEntity {
  @Column({ name: 'trip_id' }) tripId: number;
  @Column({ name: 'user_id' }) userId: number;
  @Column({ name: 'read_at', type: 'datetime', precision: 6 }) readAt: Date;
}
