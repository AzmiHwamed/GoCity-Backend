import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum OrganizationProgramType {
  ACTIVITY = 'activity',
  TRIP = 'trip',
}

/** A reusable activity or an itinerary proposed by an organization. */
@Entity('organization_programs')
@Index(['organizationId', 'isPublished'])
export class OrganizationProgram extends BaseEntity {
  @Column({ name: 'organization_id' }) organizationId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Relation<User>;

  @ApiProperty({ enum: OrganizationProgramType })
  @Column({ name: 'program_type', type: 'enum', enum: OrganizationProgramType })
  programType: OrganizationProgramType;

  @ApiProperty() @Column({ length: 200 }) title: string;
  @ApiPropertyOptional() @Column({ type: 'text', nullable: true }) description: string | null;
  // Explicit type is required because `string | null` emits Object metadata at runtime.
  @ApiPropertyOptional() @Column({ type: 'varchar', length: 150, nullable: true }) destination:
    string | null;
  @ApiProperty({ example: 1 })
  @Column({ name: 'duration_days', type: 'int', default: 1 })
  durationDays: number;
  @ApiProperty({
    description: 'ActivityDetailsDto for activity programs, or an array of them for trip programs.',
  })
  @Column({ type: 'json' })
  content: Record<string, unknown> | Record<string, unknown>[];
  @ApiProperty() @Column({ name: 'is_published', default: false }) isPublished: boolean;
  @ApiProperty() @Column({ name: 'use_count', type: 'int', default: 0 }) useCount: number;

  // Detail fields shown on the program page. All nullable so existing rows keep working.
  @ApiPropertyOptional({ example: 'Food & drink' })
  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;
  @ApiPropertyOptional({ example: 45, description: 'Price per person' })
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? null : Number(v)) } })
  price: number | null;
  @ApiPropertyOptional({ example: 'EUR' })
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;
  @ApiPropertyOptional({ example: 'easy', enum: ['easy', 'moderate', 'challenging'] })
  @Column({ type: 'varchar', length: 20, nullable: true })
  difficulty: string | null;
  @ApiPropertyOptional({ example: 12 })
  @Column({ name: 'max_group_size', type: 'int', nullable: true })
  maxGroupSize: number | null;
  @ApiPropertyOptional({ type: [String], example: ['English', 'French'] })
  @Column({ type: 'json', nullable: true })
  languages: string[] | null;
  @ApiPropertyOptional({ type: [String], example: ['Taste 8 local dishes'] })
  @Column({ type: 'json', nullable: true })
  highlights: string[] | null;
  @ApiPropertyOptional({ type: [String], example: ['Local guide', 'All tastings'] })
  @Column({ type: 'json', nullable: true })
  included: string[] | null;
  @ApiPropertyOptional({ type: [String], example: ['Hotel pickup'] })
  @Column({ type: 'json', nullable: true })
  excluded: string[] | null;
  @ApiPropertyOptional({ type: [String], example: ['Comfortable shoes'] })
  @Column({ name: 'what_to_bring', type: 'json', nullable: true })
  whatToBring: string[] | null;
  @ApiPropertyOptional({ example: 'Bab El Bhar gate, Tunis' })
  @Column({ name: 'meeting_point', type: 'varchar', length: 255, nullable: true })
  meetingPoint: string | null;
  @ApiPropertyOptional({ example: 'Free cancellation up to 24 hours before.' })
  @Column({ name: 'cancellation_policy', type: 'text', nullable: true })
  cancellationPolicy: string | null;
  @ApiPropertyOptional({ example: 'https://example.com/book' })
  @Column({ name: 'booking_url', type: 'varchar', length: 500, nullable: true })
  bookingUrl: string | null;
  @ApiPropertyOptional({ description: 'Media id of the image shown first' })
  @Column({ name: 'cover_image_id', type: 'int', nullable: true })
  coverImageId: number | null;
}
