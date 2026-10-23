import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;

export class CitySearchQueryDto {
  @ApiProperty({ example: 'lisb', description: 'What the user typed (2+ characters)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @Matches(LANG, { message: 'lang must look like en or pt-BR' })
  lang?: string;

  @ApiPropertyOptional({
    description: 'Optional Google autocomplete session token (cheaper billing per session)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionToken?: string;
}

/** Places for activities: museums, restaurants, viewpoints… near the trip's city. */
export class PlaceSearchQueryDto {
  @ApiProperty({ example: 'pastéis de belém', description: 'What the user typed (2+ characters)' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  q: string;

  @ApiPropertyOptional({
    description: 'Bias results around this place (e.g. the trip city placeId)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[\w-]+$/, { message: 'near has invalid characters' })
  near?: string;

  @ApiPropertyOptional({ example: 38.7223, description: 'Or bias around lat+lng' })
  @ValidateIf((o: PlaceSearchQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -9.1393 })
  @ValidateIf((o: PlaceSearchQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 8, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @Matches(LANG, { message: 'lang must look like en or pt-BR' })
  lang?: string;
}

export class PlaceResultDto {
  @ApiProperty() placeId: string;
  @ApiProperty({ example: 'Pastéis de Belém' }) name: string;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Bakery' }) category: string | null;
  @ApiProperty({ example: 38.6975 }) latitude: number;
  @ApiProperty({ example: -9.2032 }) longitude: number;
  @ApiPropertyOptional({ nullable: true }) rating: number | null;
  @ApiPropertyOptional({ nullable: true }) googleMapsUri: string | null;
}

export class LangQueryDto {
  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @Matches(LANG, { message: 'lang must look like en or pt-BR' })
  lang?: string;
}

/** One of placeId, city, lat+lng or q is needed. */
export class HotelSearchQueryDto {
  @ApiPropertyOptional({ description: 'City placeId from /places/cities/search' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  placeId?: string;

  @ApiPropertyOptional({ example: 'Lisbon' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string;

  @ApiPropertyOptional({ example: 38.7223 })
  @ValidateIf((o: HotelSearchQueryDto) => o.lng !== undefined || o.lat !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: -9.1393 })
  @ValidateIf((o: HotelSearchQueryDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'boutique hotel near Rossio', description: 'Free text' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  q?: string;

  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    maximum: 4,
    description: '1 = cheap … 4 = luxury',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  maxPriceLevel?: number;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional({ description: 'nextPageToken from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageToken?: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @Matches(LANG, { message: 'lang must look like en or pt-BR' })
  lang?: string;
}

export type HotelSearchOptions = Omit<HotelSearchQueryDto, never>;

export class PhotoQueryDto {
  @ApiProperty({ description: 'Photo name from a hotel result (already in photoUrl)' })
  @IsString()
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({ example: 800, default: 800, minimum: 100, maximum: 1600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(1600)
  maxWidth?: number;
}

export class CitySuggestionDto {
  @ApiProperty() placeId: string;
  @ApiProperty({ example: 'Lisbon' }) name: string;
  @ApiPropertyOptional({ example: 'Portugal', nullable: true }) description: string | null;
  @ApiProperty({ example: 'Lisbon, Portugal' }) fullText: string;
}

export class CityDetailsDto {
  @ApiProperty() placeId: string;
  @ApiProperty({ example: 'Lisbon' }) name: string;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiPropertyOptional({ example: 'Portugal', nullable: true }) country: string | null;
  @ApiPropertyOptional({ example: 'PT', nullable: true }) countryCode: string | null;
  @ApiPropertyOptional({ example: 38.7223, nullable: true }) latitude: number | null;
  @ApiPropertyOptional({ example: -9.1393, nullable: true }) longitude: number | null;
}

export class HotelDto {
  @ApiProperty() placeId: string;
  @ApiProperty({ example: 'Hotel Avenida' }) name: string;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude: number | null;
  @ApiPropertyOptional({ example: 4.4, nullable: true }) rating: number | null;
  @ApiPropertyOptional({ example: 1832, nullable: true }) userRatingCount: number | null;
  @ApiPropertyOptional({ example: 2, nullable: true, description: '0 = free … 4 = very expensive' })
  priceLevel: number | null;
  @ApiPropertyOptional({
    nullable: true,
    example: '/api/v1/places/photo?name=places%2F...%2Fphotos%2F...',
  })
  photoUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) websiteUri: string | null;
  @ApiPropertyOptional({ nullable: true }) googleMapsUri: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
}

/** A Google photo served through our proxy, with the credit Google requires us to show. */
export class PlacePhotoDto {
  @ApiProperty({ example: '/api/v1/places/photo?name=places%2FChIJ...%2Fphotos%2F...' })
  url: string;
  @ApiPropertyOptional({
    nullable: true,
    example: 'Maria Silva',
    description: 'Show as "Photo: …"',
  })
  attribution: string | null;
  @ApiPropertyOptional({ nullable: true }) attributionUrl: string | null;
}

export class PlaceDetailsQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Also return the opening hours on this day (e.g. the activity date)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export class PlaceReviewDto {
  @ApiPropertyOptional({ nullable: true, example: 'Ana' }) author: string | null;
  @ApiPropertyOptional({ nullable: true, example: 5 }) rating: number | null;
  @ApiPropertyOptional({ nullable: true }) text: string | null;
  @ApiPropertyOptional({ nullable: true, example: '2 weeks ago' }) when: string | null;
}

/** Everything a place card needs (activity, hotel…). */
export class PlaceDetailsDto {
  @ApiProperty() placeId: string;
  @ApiProperty({ example: 'Belém Tower' }) name: string;
  @ApiPropertyOptional({ nullable: true, example: 'Historical landmark' }) category: string | null;
  @ApiPropertyOptional({ nullable: true }) summary: string | null;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude: number | null;
  @ApiPropertyOptional({ nullable: true, example: 4.6 }) rating: number | null;
  @ApiPropertyOptional({ nullable: true, example: 48211 }) userRatingCount: number | null;
  @ApiPropertyOptional({ nullable: true, example: 2, description: '0 free … 4 very expensive' })
  priceLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) websiteUri: string | null;
  @ApiPropertyOptional({ nullable: true }) googleMapsUri: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Right now (Google)' }) openNow:
    boolean | null;
  @ApiProperty({ type: [String], example: ['Monday: 10:00 AM – 5:30 PM'] }) weeklyHours: string[];
  @ApiPropertyOptional({
    nullable: true,
    example: 'Tuesday: 10:00 AM – 5:30 PM',
    description: 'Hours on the requested date',
  })
  hoursOnDate: string | null;
  @ApiProperty({ type: [PlacePhotoDto] }) photos: PlacePhotoDto[];
  @ApiProperty({ type: [PlaceReviewDto], description: 'Up to 3, as Google returns them' })
  reviews: PlaceReviewDto[];
  @ApiProperty({ type: [String], example: ['Wheelchair accessible entrance', 'Good for children'] })
  amenities: string[];
}

export class HotelPageDto {
  @ApiProperty({ type: [HotelDto] }) hotels: HotelDto[];
  @ApiPropertyOptional({ nullable: true, description: 'Pass as pageToken for the next page' })
  nextPageToken: string | null;
}
