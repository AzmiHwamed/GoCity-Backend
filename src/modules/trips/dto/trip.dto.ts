import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
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
import { DATE_REGEX } from '../trip.utils';

export class CreateTripDto {
  @ApiProperty({ example: 'Lisbon weekend' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '2026-11-01' })
  @Matches(DATE_REGEX, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ example: '2026-11-03', description: 'Same day as startDate or later' })
  @Matches(DATE_REGEX, { message: 'endDate must be YYYY-MM-DD' })
  endDate: string;

  @ApiPropertyOptional({ example: 4, default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  travelersCount?: number;

  @ApiPropertyOptional({ example: 350, description: 'Estimated budget per person' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetPerPerson?: number | null;

  @ApiPropertyOptional({ example: 'Hotel Avenida' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hotelName?: string | null;

  @ApiPropertyOptional({ example: 38.7223, description: 'Give together with hotelLongitude' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  hotelLatitude?: number | null;

  @ApiPropertyOptional({ example: -9.1393 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  hotelLongitude?: number | null;

  @ApiPropertyOptional({
    example: 'ChIJO_PkYRozGQ0R0DaQ5L3rAAQ',
    description: 'City placeId from GET /places/cities/search; fills city, country and coordinates',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cityPlaceId?: string | null;

  @ApiPropertyOptional({
    example: 'Lisbon',
    description: 'City name (filled from cityPlaceId if omitted)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string | null;
}

/** Send null to clear an optional field (budget, hotel). */
export class UpdateTripDto extends PartialType(CreateTripDto) {}
