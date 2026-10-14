import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/** What can be saved as a favorite. */
export enum FavoriteType {
  /** A trip shared by someone (or one of your own). targetId = trip id. */
  TRIP = 'trip',
  /** One activity/plan of a trip you can see. targetId = activity id. */
  ACTIVITY = 'activity',
  /** A hotel from Google Places. targetId = Google placeId. */
  HOTEL = 'hotel',
  /** A city / destination from Google Places. targetId = Google placeId. */
  PLACE = 'place',
}

/**
 * One saved item. `targetId` is a string so it can hold our numeric ids and Google placeIds.
 * title/subtitle/imageUrl are a snapshot for display; trips and activities are refreshed when listed.
 */
@Entity('favorites')
@Index(['userId', 'type', 'targetId'], { unique: true })
@Index(['type', 'targetId'])
export class Favorite extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @ApiProperty({ enum: FavoriteType })
  @Column({ type: 'enum', enum: FavoriteType })
  type: FavoriteType;

  @ApiProperty({ example: '12', description: 'Trip/activity id, or Google placeId' })
  @Column({ name: 'target_id', length: 255 })
  targetId: string;

  @ApiProperty({ example: 'Lisbon weekend' })
  @Column({ length: 200 })
  title: string;

  @ApiPropertyOptional({ nullable: true, example: 'Lisbon, Portugal · 3 days' })
  @Column({ type: 'varchar', length: 300, nullable: true })
  subtitle: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'image_url', type: 'text', nullable: true }) // Google photo urls can pass 500 chars
  imageUrl: string | null;
}
