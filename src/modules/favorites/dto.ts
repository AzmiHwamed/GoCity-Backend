import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FavoriteType } from './entities/favorite.entity';

export class AddFavoriteDto {
  @ApiProperty({ enum: FavoriteType, example: FavoriteType.TRIP })
  @IsEnum(FavoriteType)
  type: FavoriteType;

  @ApiProperty({
    example: '12',
    description: 'Trip/activity id, or a Google placeId for hotel/place',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[\w-]+$/, { message: 'targetId has invalid characters' })
  targetId: string;

  @ApiPropertyOptional({
    description: 'Hotel/place only: name to show if Google Places is unavailable',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class FavoriteQueryDto {
  @ApiPropertyOptional({ enum: FavoriteType, description: 'Only this type' })
  @IsOptional()
  @IsEnum(FavoriteType)
  type?: FavoriteType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class FavoriteCheckQueryDto {
  @ApiProperty({ enum: FavoriteType })
  @IsEnum(FavoriteType)
  type: FavoriteType;

  @ApiProperty({ example: '3,7,12', description: 'Comma-separated targetIds (max 100)' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

export class FavoriteCountsDto {
  @ApiProperty() all: number;
  @ApiProperty() trip: number;
  @ApiProperty() activity: number;
  @ApiProperty() hotel: number;
  @ApiProperty() place: number;
}

export class FavoriteViewDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: FavoriteType }) type: FavoriteType;
  @ApiProperty() targetId: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true }) subtitle: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty({
    description: 'False when the trip/activity was deleted or is no longer visible to you',
  })
  available: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Trip id to open (trip, or the trip an activity belongs to)',
  })
  tripId: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Google Maps link for hotels/places' })
  mapsUrl: string | null;
  @ApiProperty() createdAt: Date;
}

export class FavoritePageDto {
  @ApiProperty({ type: [FavoriteViewDto] }) items: FavoriteViewDto[];
  @ApiProperty({ type: FavoriteCountsDto }) counts: FavoriteCountsDto;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty({ description: 'Items matching the type filter' }) total: number;
}
