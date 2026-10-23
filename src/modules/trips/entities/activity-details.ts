import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { ActivityKind, Transportation } from '../trip.enums';

const coordinate = (name: string) =>
  Column({
    name,
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  });

/**
 * Columns shared by activities and ideas, so an accepted idea can be copied
 * into an activity as-is. Not a table by itself.
 */
export abstract class ActivityDetails extends BaseEntity {
  @ApiProperty({ enum: ActivityKind, example: ActivityKind.ACTIVITY })
  @Column({ type: 'enum', enum: ActivityKind, default: ActivityKind.ACTIVITY })
  kind: ActivityKind;

  @ApiProperty({ example: 'Tram 28 ride' })
  @Column({ length: 200 })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ example: 1, description: 'Day of the trip, 1 = startDate' })
  @Column({ name: 'day_number', type: 'int' })
  dayNumber: number;

  @ApiProperty({ example: '09:30:00' })
  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @ApiProperty({ example: '11:00:00' })
  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @ApiPropertyOptional({ example: 'Praça Martim Moniz', nullable: true })
  @Column({ name: 'place_name', type: 'varchar', length: 200, nullable: true })
  placeName: string | null;

  @ApiPropertyOptional({
    example: 'ChIJ6Qx3o3gzGQ0R9ghlS2XuRaA',
    nullable: true,
    description: 'Google placeId when the place was picked from /places/search',
  })
  @Column({ name: 'place_id', type: 'varchar', length: 255, nullable: true })
  placeId: string | null;

  @ApiPropertyOptional({ example: 38.7158, nullable: true })
  @coordinate('place_latitude')
  placeLatitude: number | null;

  @ApiPropertyOptional({ example: -9.1365, nullable: true })
  @coordinate('place_longitude')
  placeLongitude: number | null;

  @ApiPropertyOptional({ example: 'In front of the hotel', nullable: true })
  @Column({ name: 'meeting_point_text', type: 'varchar', length: 255, nullable: true })
  meetingPointText: string | null;

  @ApiPropertyOptional({ example: 38.7197, nullable: true })
  @coordinate('meeting_latitude')
  meetingLatitude: number | null;

  @ApiPropertyOptional({ example: -9.1416, nullable: true })
  @coordinate('meeting_longitude')
  meetingLongitude: number | null;

  @ApiPropertyOptional({ enum: Transportation, nullable: true })
  @Column({ type: 'enum', enum: Transportation, nullable: true })
  transportation: Transportation | null;

  @ApiProperty({ example: 12.5, description: 'Cost, added to the trip total' })
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  expense: number;
}

/** Every column of ActivityDetails, for copying an idea into an activity. */
export const ACTIVITY_DETAIL_FIELDS = [
  'kind',
  'name',
  'description',
  'dayNumber',
  'startTime',
  'endTime',
  'placeName',
  'placeId',
  'placeLatitude',
  'placeLongitude',
  'meetingPointText',
  'meetingLatitude',
  'meetingLongitude',
  'transportation',
  'expense',
] as const;
