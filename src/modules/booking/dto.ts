import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PlacePhotoDto } from '../places/dto';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const IATA = /^[A-Z]{3}$/;
/** A month (2026-12) or a day (2026-12-01). */
const DATE_OR_MONTH = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

// ── Queries ─────────────────────────────────────────────────

export class FlightPlacesQueryDto {
  @ApiProperty({ example: 'lisb', description: 'City or airport name, or a code (2+ characters)' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  term: string;
}

export class FlightSearchQueryDto {
  @ApiProperty({ example: 'PAR', description: 'IATA city or airport code' })
  @Transform(upper)
  @Matches(IATA, { message: 'origin must be a 3-letter IATA code' })
  origin: string;

  @ApiProperty({ example: 'LIS', description: 'IATA city or airport code' })
  @Transform(upper)
  @Matches(IATA, { message: 'destination must be a 3-letter IATA code' })
  destination: string;

  @ApiProperty({ example: '2026-12-01', description: 'YYYY-MM-DD, or YYYY-MM for the whole month' })
  @Matches(DATE_OR_MONTH, { message: 'departDate must be YYYY-MM-DD or YYYY-MM' })
  departDate: string;

  @ApiPropertyOptional({ example: '2026-12-08', description: 'Leave out for one-way' })
  @IsOptional()
  @Matches(DATE_OR_MONTH, { message: 'returnDate must be YYYY-MM-DD or YYYY-MM' })
  returnDate?: string;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  adults?: number;
}

export class FlightPricesQueryDto extends FlightSearchQueryDto {
  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code like EUR' })
  currency?: string;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class EsimQueryDto {
  @ApiPropertyOptional({ example: 'PT', description: 'Country code (PT) or name (Portugal)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;
}

// ── Responses ───────────────────────────────────────────────

export class ProviderDto {
  @ApiProperty({ example: 'Aviasales / Travelpayouts' }) name: string;
  @ApiProperty() logoUrl: string;
}

/** A city or airport from the Travelpayouts reference data. */
export class FlightPlaceDto {
  @ApiProperty({ example: 'LIS' }) code: string;
  @ApiProperty({ enum: ['city', 'airport'] }) type: 'city' | 'airport';
  @ApiProperty({ example: 'Lisbon' }) name: string;
  @ApiPropertyOptional({ nullable: true, example: 'LIS', description: 'For airports: their city' })
  cityCode: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Lisbon' }) cityName: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'PT' }) countryCode: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Portugal' }) countryName: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Humberto Delgado Airport' })
  airportName: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude: number | null;
}

export class AirlineDto {
  @ApiProperty({ example: 'TP' }) code: string;
  @ApiProperty({ example: 'TAP Air Portugal' }) name: string;
  @ApiProperty({ example: 'https://pics.avs.io/200/200/TP.png' }) logoUrl: string;
}

export class FlightOfferDto {
  @ApiProperty({ example: 89 }) price: number;
  @ApiProperty({ example: 'EUR' }) currency: string;
  @ApiPropertyOptional({ type: AirlineDto, nullable: true }) airline: AirlineDto | null;
  @ApiPropertyOptional({ nullable: true, example: 'TP439' }) flightNumber: string | null;
  @ApiProperty({ example: '2026-12-01T07:05:00+01:00' }) departureAt: string;
  @ApiPropertyOptional({ nullable: true }) returnAt: string | null;
  @ApiProperty({ example: '2026-12-01' }) departureDate: string;
  @ApiPropertyOptional({ nullable: true }) returnDate: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'ORY' }) originAirport: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'LIS' }) destinationAirport: string | null;
  @ApiProperty({ example: 0, description: 'Stops on the way out' }) stops: number;
  @ApiPropertyOptional({ nullable: true }) returnStops: number | null;
  @ApiPropertyOptional({ nullable: true, example: 155, description: 'Outbound flight time' })
  durationMinutes: number | null;
  @ApiPropertyOptional({ nullable: true }) returnDurationMinutes: number | null;
  @ApiProperty({ description: 'Partner page for this offer' }) bookingUrl: string;
  @ApiProperty({ example: 'View flight' }) ctaLabel: string;
}

export class FlightRouteDto {
  @ApiPropertyOptional({ type: FlightPlaceDto, nullable: true }) origin: FlightPlaceDto | null;
  @ApiPropertyOptional({ type: FlightPlaceDto, nullable: true }) destination: FlightPlaceDto | null;
  @ApiProperty() originCode: string;
  @ApiProperty() destinationCode: string;
  @ApiProperty() departDate: string;
  @ApiPropertyOptional({ nullable: true }) returnDate: string | null;
  @ApiProperty() adults: number;
}

export class FlightSearchLinkDto {
  @ApiProperty({ type: ProviderDto }) provider: ProviderDto;
  @ApiProperty({ type: FlightRouteDto }) route: FlightRouteDto;
  @ApiProperty({ example: 'Flights from Paris to Lisbon' }) title: string;
  @ApiProperty() description: string;
  @ApiProperty({ example: 'Search flights' }) ctaLabel: string;
  @ApiProperty() url: string;
}

export class FlightPricesDto {
  @ApiProperty({ type: ProviderDto }) provider: ProviderDto;
  @ApiProperty({ type: FlightRouteDto }) route: FlightRouteDto;
  @ApiProperty({ type: [PlacePhotoDto], description: 'Destination photos (Google, via our proxy)' })
  destinationPhotos: PlacePhotoDto[];
  @ApiProperty({ example: 'EUR' }) currency: string;
  @ApiProperty({ description: 'False when live prices are not configured or unavailable' })
  pricesAvailable: boolean;
  @ApiPropertyOptional({ nullable: true }) message: string | null;
  @ApiProperty({
    enum: ['exact', 'month'],
    description: 'month: nothing cached for the exact dates, so these are the cheapest that month',
  })
  datesMatched: 'exact' | 'month';
  @ApiProperty({ type: [FlightOfferDto], description: 'Cheapest first' }) offers: FlightOfferDto[];
  @ApiProperty({ description: 'Search page for these dates, also when there are no offers' })
  searchUrl: string;
}

export class CountryDto {
  @ApiProperty({ example: 'PT' }) code: string;
  @ApiProperty({ example: 'Portugal' }) name: string;
  @ApiProperty({ example: '🇵🇹' }) flagEmoji: string;
  @ApiProperty({ example: 'https://flagcdn.com/w160/pt.png' }) flagUrl: string;
}

export class EsimOfferDto {
  @ApiProperty({ example: 'Airalo' }) provider: string;
  @ApiProperty() providerLogo: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) highlights: string[];
  @ApiProperty() ctaLabel: string;
  @ApiProperty() url: string;
}

// ── eSIM plans ──────────────────────────────────────────────

export class EsimPlanDto {
  @ApiPropertyOptional({ nullable: true, description: 'Id of an admin-listed plan' }) id:
    number | null;
  @ApiProperty({ example: 'Airalo' }) provider: string;
  @ApiPropertyOptional({ nullable: true }) providerLogo: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'MEO', description: 'Mobile network' })
  network: string | null;
  @ApiProperty({ example: 'Portugal 5 GB' }) title: string;
  @ApiPropertyOptional({ nullable: true, example: 5120 }) dataMb: number | null;
  @ApiProperty() isUnlimited: boolean;
  @ApiPropertyOptional({ nullable: true, example: '5 GB' }) dataLabel: string | null;
  @ApiProperty({ example: 30 }) validityDays: number;
  @ApiProperty({ example: 11.5 }) price: number;
  @ApiProperty({ example: 'USD' }) currency: string;
  @ApiProperty() url: string;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty({
    enum: ['airalo_api', 'manual'],
    description: 'airalo_api: live from the partner; manual: listed by GoCity admins',
  })
  source: 'airalo_api' | 'manual';
  @ApiProperty({ description: 'When the price was fetched (live) or last updated (manual)' })
  checkedAt: string;
}

export class CreateEsimPlanDto {
  @ApiProperty({ example: 'PT' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be a 2-letter ISO code' })
  countryCode: string;

  @ApiProperty({ example: 'Airalo' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  provider: string;

  @ApiProperty({ example: 'Portugal 5 GB' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ example: 5120, description: 'Data in MB (leave out when unlimited)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dataMb?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnlimited?: boolean;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays: number;

  @ApiProperty({ example: 11.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 'USD' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency: string;

  @ApiProperty({ example: 'https://www.airalo.com/portugal-esim' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url: string;

  @ApiPropertyOptional({ example: 'Data only · 5G where available' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEsimPlanDto extends PartialType(CreateEsimPlanDto) {}

export class EsimPlansQueryDto {
  @ApiPropertyOptional({ example: 'PT' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO code' })
  country?: string;
}

export class EsimListDto {
  @ApiPropertyOptional({ type: CountryDto, nullable: true }) country: CountryDto | null;
  @ApiProperty({ type: [PlacePhotoDto] }) photos: PlacePhotoDto[];
  @ApiProperty({ type: [EsimPlanDto], description: 'Plans for this country, cheapest first' })
  plans: EsimPlanDto[];
  @ApiProperty({
    enum: ['airalo_api', 'manual', 'none'],
    description: 'Where the plans come from; none: no plans for this country yet',
  })
  plansSource: 'airalo_api' | 'manual' | 'none';
  @ApiPropertyOptional({ nullable: true }) message: string | null;
  @ApiProperty({ type: [EsimOfferDto], description: 'Partner pages for this country' })
  items: EsimOfferDto[];
}

// ── Trips ───────────────────────────────────────────────────

export class TravellerDto {
  @ApiProperty() userId: number;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiPropertyOptional({ nullable: true }) avatarUrl: string | null;
  @ApiProperty() isMe: boolean;
  @ApiPropertyOptional({ nullable: true, example: 'PAR' }) homeAirportCode: string | null;
}

export class TravellerFlightsDto {
  @ApiPropertyOptional({ type: FlightPlaceDto, nullable: true }) origin: FlightPlaceDto | null;
  @ApiProperty({ example: 'PAR' }) originCode: string;
  @ApiProperty({ type: [TravellerDto], description: 'Members flying from this airport' })
  travellers: TravellerDto[];
  @ApiProperty() pricesAvailable: boolean;
  @ApiPropertyOptional({ nullable: true }) message: string | null;
  @ApiProperty({ enum: ['exact', 'month'] }) datesMatched: 'exact' | 'month';
  @ApiProperty({ type: [FlightOfferDto], description: 'Cheapest 3 for this group' })
  offers: FlightOfferDto[];
  @ApiProperty() searchUrl: string;
}

export class TripFlightsDto {
  @ApiPropertyOptional({ type: FlightPlaceDto, nullable: true }) destination: FlightPlaceDto | null;
  @ApiProperty() departDate: string;
  @ApiProperty() returnDate: string;
  @ApiProperty() currency: string;
  @ApiProperty({ type: [TravellerFlightsDto], description: 'One group per home airport' })
  groups: TravellerFlightsDto[];
  @ApiProperty({ type: [TravellerDto], description: 'Members with no home airport yet' })
  withoutAirport: TravellerDto[];
  @ApiProperty({ type: [TravellerDto], description: 'Members who live at the destination' })
  atDestination: TravellerDto[];
}

export class TripFlightsQueryDto {
  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code like EUR' })
  currency?: string;

  @ApiPropertyOptional({ description: 'For a trip that is only shared by link' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareCode?: string;
}

export class TripBookingDto {
  @ApiProperty() tripId: number;
  @ApiProperty() tripName: string;
  @ApiPropertyOptional({
    type: FlightPlaceDto,
    nullable: true,
    description: 'Matched from the trip city',
  })
  destination: FlightPlaceDto | null;
  @ApiProperty({ example: '2026-12-01' }) departDate: string;
  @ApiProperty({ example: '2026-12-03' }) returnDate: string;
  @ApiProperty({ example: 2 }) adults: number;
  @ApiPropertyOptional({ type: CountryDto, nullable: true }) country: CountryDto | null;
  @ApiProperty({ type: [PlacePhotoDto] }) photos: PlacePhotoDto[];
  @ApiProperty({ type: EsimListDto }) esims: EsimListDto;
  @ApiPropertyOptional({ type: FlightPlaceDto, nullable: true, description: 'Your home airport' })
  myHomeAirport: FlightPlaceDto | null;
}
