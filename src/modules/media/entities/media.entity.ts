import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { MEDIA_URL_PREFIX } from '../media.constants';

/** What an image is used for. Add values here as new features need them. */
export enum MediaType {
  PROFILE = 'profile',
  TRIP = 'trip',
  COVER = 'cover',
  DOCUMENT = 'document',
  OTHER = 'other',
}

/** Every uploaded file in the app, in one table. Only the file name is stored; the file lives in public/uploads. */
@Entity('media')
@Index(['type', 'entityId'])
export class Media extends BaseEntity {
  @ApiProperty({ example: '3f2a6c1e-8a8b-4d4e-9a57-0d1f0c2b9b11.png' })
  @Index({ unique: true })
  @Column({ length: 255 })
  filename: string;

  @ApiProperty({ example: 'beach.png' })
  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @ApiProperty({ example: 'image/png' })
  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @ApiProperty({ example: 204800, description: 'Size in bytes' })
  @Column({ type: 'int' })
  size: number;

  @ApiProperty({ enum: MediaType, example: MediaType.PROFILE })
  @Column({ type: 'enum', enum: MediaType, default: MediaType.OTHER })
  type: MediaType;

  @ApiProperty({ example: 1 })
  @Column({ name: 'owner_id' })
  ownerId: number;

  @Exclude()
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner?: Relation<User>;

  @ApiPropertyOptional({
    example: 42,
    nullable: true,
    description: 'Id of the record this file belongs to, e.g. the trip id for type=trip',
  })
  @Column({ name: 'entity_id', type: 'int', nullable: true })
  entityId: number | null;

  @ApiPropertyOptional({ example: 0, nullable: true, description: 'Order inside a gallery' })
  @Column({ type: 'int', nullable: true })
  position: number | null;

  @ApiProperty({ example: '/files/3f2a6c1e-8a8b-4d4e-9a57-0d1f0c2b9b11.png' })
  @Expose()
  get url(): string {
    return `${MEDIA_URL_PREFIX}/${this.filename}`;
  }
}
