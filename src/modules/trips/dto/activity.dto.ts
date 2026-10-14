import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ActivityKind, Transportation } from '../trip.enums';
import { TIME_REGEX } from '../trip.utils';

/** Fields of an activity/plan. Ideas use the same fields so they can become activities. */
export class ActivityDetailsDto {
  @ApiPropertyOptional({ enum: ActivityKind, default: ActivityKind.ACTIVITY })
  @IsOptional()
  @IsEnum(ActivityKind)
  kind?: ActivityKind;

  @ApiProperty({ example: 'Tram 28 ride' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: 1, description: 'Day of the trip, 1 = startDate' })
  @IsInt()
  @Min(1)
  dayNumber: number;

  @ApiProperty({ example: '09:30', description: 'HH:MM or HH:MM:SS' })
  @Matches(TIME_REGEX, { message: 'startTime must be HH:MM or HH:MM:SS' })
  startTime: string;

  @ApiProperty({ example: '11:00', description: 'After startTime, same day' })
  @Matches(TIME_REGEX, { message: 'endTime must be HH:MM or HH:MM:SS' })
  endTime: string;

  @ApiPropertyOptional({ example: 'Praça Martim Moniz' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeName?: string | null;

  @ApiPropertyOptional({ example: 38.7158, description: 'Give together with placeLongitude' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  placeLatitude?: number | null;

  @ApiPropertyOptional({ example: -9.1365 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  placeLongitude?: number | null;

  @ApiPropertyOptional({ example: 'In front of the hotel' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  meetingPointText?: string | null;

  @ApiPropertyOptional({ example: 38.7197, description: 'Give together with meetingLongitude' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  meetingLatitude?: number | null;

  @ApiPropertyOptional({ example: -9.1416 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  meetingLongitude?: number | null;

  @ApiPropertyOptional({ enum: Transportation })
  @IsOptional()
  @IsEnum(Transportation)
  transportation?: Transportation | null;

  @ApiPropertyOptional({ example: 12.5, default: 0, description: 'Added to the trip expenses' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expense?: number;
}

export class UpdateActivityDto extends PartialType(ActivityDetailsDto) {}

export class QueryActivitiesDto {
  @ApiPropertyOptional({ example: 1, description: 'Only this day of the trip' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  day?: number;
}
