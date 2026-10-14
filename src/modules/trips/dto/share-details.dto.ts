import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_TIPS = 20;
export const MAX_TIP_LENGTH = 500;
export const MAX_STORY_LENGTH = 5000;
export const MAX_IMAGES_PER_REQUEST = 10;

/** Multipart sends everything as strings: "" means "clear it". */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

/** Tips may arrive as a JSON array, repeated form fields, or a single form field. */
const toTipList = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value; // fails validation below with a clear message
      }
    }
    return trimmed === '' ? [] : [value];
  }
  return value;
};

/**
 * What the owner shares about a trip. Every field is optional; send only what changes.
 * `null` (or an empty form field) clears story / actualSpentPerPerson.
 */
export class ShareDetailsDto {
  @ApiPropertyOptional({
    example: 'Three days of trams, pastéis and fado. Day 2 was the highlight…',
    maxLength: MAX_STORY_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(MAX_STORY_LENGTH)
  story?: string | null;

  @ApiPropertyOptional({
    example: 420,
    nullable: true,
    description: 'What each person actually spent (the estimate stays in budgetPerPerson)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === '' || value === null ? null : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualSpentPerPerson?: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Buy a 24h transport card', 'Book Belém tower tickets online'],
    description: `Replaces all tips, in this order (max ${MAX_TIPS}). Send [] to remove them.`,
  })
  @IsOptional()
  @Transform(toTipList)
  @IsArray()
  @ArrayMaxSize(MAX_TIPS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_TIP_LENGTH, { each: true })
  tips?: string[];
}

export class GalleryOrderDto {
  @ApiProperty({
    type: [Number],
    example: [12, 9, 15],
    description: "All of the trip's image ids, in the new order",
  })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  mediaIds: number[];
}

export class SetCoverDto {
  @ApiPropertyOptional({
    example: 12,
    nullable: true,
    description: 'A gallery image id, or null to use the first image',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  mediaId: number | null;
}

/** Swagger body for multipart share-details (fields + images). */
export const SHARE_DETAILS_MULTIPART_SCHEMA = {
  type: 'object',
  properties: {
    story: { type: 'string', maxLength: MAX_STORY_LENGTH },
    actualSpentPerPerson: { type: 'number', minimum: 0 },
    tips: {
      type: 'array',
      items: { type: 'string', maxLength: MAX_TIP_LENGTH },
      maxItems: MAX_TIPS,
      description: 'Repeat the field for each tip, or send one JSON array string',
    },
    images: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      maxItems: MAX_IMAGES_PER_REQUEST,
      description: 'Optional: images added to the gallery',
    },
  },
};

export const GALLERY_UPLOAD_SCHEMA = {
  type: 'object',
  required: ['images'],
  properties: {
    images: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      maxItems: MAX_IMAGES_PER_REQUEST,
      description: 'jpeg, png, webp or gif',
    },
  },
};
