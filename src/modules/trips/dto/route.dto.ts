import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transportation } from '../trip.enums';

export class DayRouteQueryDto {
  @ApiProperty({ example: 1, description: 'Day of the trip (1 = startDate)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  day: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Start and end the day at the hotel (needs hotel coordinates)',
  })
  @IsOptional()
  // Read the raw query value: implicit conversion would turn the string 'false' into true.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    [true, 'true', '1'].includes(obj[key] as string | boolean),
  )
  @IsBoolean()
  includeHotel?: boolean = false;

  @ApiPropertyOptional({ description: 'Needed for a trip that is only shared by link' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareCode?: string;
}

export class RouteStopDto {
  @ApiProperty({ example: 0 }) index: number;
  @ApiProperty({ enum: ['activity', 'hotel'] }) kind: 'activity' | 'hotel';
  @ApiPropertyOptional({ nullable: true }) activityId: number | null;
  @ApiProperty({ example: 'Belém Tower' }) name: string;
  @ApiPropertyOptional({
    nullable: true,
    example: 'Belém Tower',
    description: 'Place or meeting point',
  })
  place: string | null;
  @ApiPropertyOptional({ nullable: true, example: '10:00' }) startTime: string | null;
  @ApiPropertyOptional({ nullable: true, example: '11:30' }) endTime: string | null;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
}

export class RouteLegDto {
  @ApiProperty({ description: 'Index of the stop it leaves from' }) from: number;
  @ApiProperty({ description: 'Index of the stop it goes to' }) to: number;
  @ApiProperty({ enum: Transportation }) mode: Transportation;
  @ApiProperty({
    enum: ['ok', 'no_route', 'failed'],
    description: 'no_route: Google found no way (e.g. no transit); failed: Google error',
  })
  status: 'ok' | 'no_route' | 'failed';
  @ApiPropertyOptional({ nullable: true }) distanceMeters: number | null;
  @ApiPropertyOptional({ nullable: true }) durationSeconds: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Google encoded polyline' })
  polyline: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Tram 15E (6 stops)' })
  transit: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Minutes between the end of one activity and the start of the next',
  })
  gapMinutes: number | null;
  @ApiProperty({ description: 'The travel time is longer than the gap' }) late: boolean;
}

export class MissingLocationDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ example: '12:00' }) startTime: string;
}

export class DayRouteDto {
  @ApiProperty() day: number;
  @ApiProperty({ example: '2026-12-01' }) date: string;
  @ApiProperty() includeHotel: boolean;
  @ApiProperty({ type: [RouteStopDto] }) stops: RouteStopDto[];
  @ApiProperty({ type: [RouteLegDto] }) legs: RouteLegDto[];
  @ApiProperty({ type: [MissingLocationDto], description: 'Activities without coordinates' })
  missing: MissingLocationDto[];
  @ApiProperty() totalDistanceMeters: number;
  @ApiProperty() totalDurationSeconds: number;
  @ApiProperty({ description: 'False when Google Routes could not be used (see warnings)' })
  routingAvailable: boolean;
  @ApiProperty({ type: [String] }) warnings: string[];
}
