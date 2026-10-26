import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserSummaryDto } from '../../users/dto/search-users.dto';
import { Media } from '../../media/entities/media.entity';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripMemberRole, TripVisibility } from '../trip.enums';
import { OrganizationProgram } from '../../organizations/entities/organization-program.entity';
import { DATE_REGEX } from '../trip.utils';

// ── Visibility / share link ────────────────────────────────

export class UpdateVisibilityDto {
  @ApiProperty({
    enum: TripVisibility,
    description:
      'private = members only · link = anyone with the share link (read-only) · public = listed for everyone',
  })
  @IsEnum(TripVisibility)
  visibility: TripVisibility;
}

export class ShareInfoDto {
  @ApiProperty({ enum: TripVisibility }) visibility: TripVisibility;
  @ApiPropertyOptional({ example: 'Zx81kQ0aB2c', nullable: true }) shareCode: string | null;
  @ApiPropertyOptional({
    example: 'http://localhost:3000/trips/shared/Zx81kQ0aB2c',
    nullable: true,
    description: 'Works while visibility is link or public',
  })
  shareUrl: string | null;
}

// ── Copying ────────────────────────────────────────────────

export class CopyTripDto {
  @ApiPropertyOptional({ example: 'My Lisbon trip', description: 'Default: "<original> (copy)"' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    example: '2027-05-10',
    description: 'New start date; the end date keeps the same length. Default: same dates.',
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Needed to copy a link-shared trip you are not a member of' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareCode?: string;
}

export class CopyActivityDto {
  @ApiProperty({ example: 12, description: 'Your trip to copy it into (editor or owner)' })
  @IsInt()
  @Min(1)
  targetTripId: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Day in your trip. Default: the same day number.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;

  @ApiPropertyOptional({ description: 'Needed when the source trip is only shared by link' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareCode?: string;
}

// ── Browsing / listing ─────────────────────────────────────

export const TRIP_SORTS = ['newest', 'start_date'] as const;
export const TRIP_WHEN = ['upcoming', 'past'] as const;

export class BrowseTripsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'lisbon', description: 'Part of the trip name or city' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: 'Only trips in this city (placeId from GET /places/cities/search)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cityPlaceId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'Trips starting on or after this date',
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Trips ending on or before this date',
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: TRIP_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(TRIP_SORTS)
  sort?: (typeof TRIP_SORTS)[number];
}

/** City-only public-trip search used by the city-breaks feed. */
export class CityBreaksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'Lisbon', description: 'Part of the destination city name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: 'Destination city placeId from GET /places/cities/search',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cityPlaceId?: string;

  @ApiPropertyOptional({ enum: TRIP_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(TRIP_SORTS)
  sort?: (typeof TRIP_SORTS)[number];
}

export class MyTripsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TripMemberRole, description: 'Only trips where I have this role' })
  @IsOptional()
  @IsEnum(TripMemberRole)
  role?: TripMemberRole;

  @ApiPropertyOptional({ enum: TRIP_WHEN, description: 'upcoming = not ended yet; past = ended' })
  @IsOptional()
  @IsIn(TRIP_WHEN)
  when?: (typeof TRIP_WHEN)[number];
}

// ── Read-only view for non-members ─────────────────────────

/** What people outside the trip see: no members, emails, codes, invitations or ideas. */
export class PublicTripDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() startDate: string;
  @ApiProperty() endDate: string;
  @ApiProperty() durationDays: number;
  @ApiProperty() travelersCount: number;
  @ApiPropertyOptional({ nullable: true }) budgetPerPerson: number | null;
  @ApiPropertyOptional({ nullable: true }) totalBudget: number | null;
  @ApiPropertyOptional({ nullable: true }) hotelName: string | null;
  @ApiPropertyOptional({ nullable: true }) hotelLatitude: number | null;
  @ApiPropertyOptional({ nullable: true }) hotelLongitude: number | null;
  @ApiProperty({ enum: TripVisibility }) visibility: TripVisibility;
  @ApiProperty() totalExpenses: number;
  @ApiProperty() totalExpensesPerPerson: number;
  @ApiPropertyOptional({ nullable: true }) hotelAddress: string | null;
  @ApiPropertyOptional({ nullable: true }) hotelPlaceId: string | null;
  @ApiPropertyOptional({ example: 'Lisbon', nullable: true }) city: string | null;
  @ApiPropertyOptional({ example: 'Portugal', nullable: true }) country: string | null;
  @ApiPropertyOptional({ nullable: true }) cityPlaceId: string | null;
  @ApiProperty() memberCount: number;
  @ApiProperty({ type: UserSummaryDto }) owner: UserSummaryDto | null;
  @ApiPropertyOptional({
    enum: TripMemberRole,
    nullable: true,
    description: 'Your role if you are a member',
  })
  myRole: TripMemberRole | null;
  @ApiProperty({ description: 'In your favorites' }) isFavorite: boolean;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ nullable: true, description: 'What each person actually spent' })
  actualSpentPerPerson: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'actual − estimated, per person' })
  spendDifferencePerPerson: number | null;
  @ApiPropertyOptional({ nullable: true, example: '/files/3f2a.jpg' })
  coverUrl: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Lists only: first ~200 characters' })
  storyExcerpt?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Single trip only: the full story' })
  story?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Single trip only: tips for others' })
  tips?: string[];
  @ApiPropertyOptional({ type: [Media], description: 'Single trip only: images in order' })
  gallery?: Media[];
  @ApiPropertyOptional({
    type: [TripActivity],
    description: 'Included when viewing one trip, not in lists',
  })
  activities?: TripActivity[];
}

/** Suggestions ranked for the destination of one of the caller's trips. */
export class TripRecommendationsDto {
  @ApiProperty({ example: 'Lisbon', nullable: true }) city: string | null;
  @ApiProperty({ type: [OrganizationProgram] }) programs: OrganizationProgram[];
  @ApiProperty({ type: [PublicTripDto] }) trips: PublicTripDto[];
}

/** A trip on someone's profile, with that user's role in it. */
export class ProfileTripDto extends PublicTripDto {
  @ApiProperty({ enum: TripMemberRole, description: "The profile owner's role in this trip" })
  role: TripMemberRole;
}

export class UserProfileDto extends UserSummaryDto {
  @ApiProperty() createdAt: Date;
  @ApiProperty({ example: 4, description: 'Public trips this user owns or belongs to' })
  publicTripCount: number;

  // Only for yourself or admins:
  @ApiPropertyOptional({ description: 'Only shown to you and admins' }) email?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Only shown to you and admins' })
  phone?: string | null;
  @ApiPropertyOptional({ description: 'Only shown to you and admins' }) isActive?: boolean;
  @ApiPropertyOptional({ description: 'All trips, only shown to you and admins' })
  tripCount?: number;
}

export class UserTripsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TRIP_WHEN })
  @IsOptional()
  @IsIn(TRIP_WHEN)
  when?: (typeof TRIP_WHEN)[number];
}
