import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Fields a user may change on their own account (email, role and password are not here). */
export class UpdateProfileDto extends PartialType(
  PickType(CreateUserDto, ['firstName', 'lastName', 'phone'] as const),
) {
  @ApiPropertyOptional({ example: 'Acme Tours', description: 'Only applied for organizations' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  organizationName?: string;

  @ApiPropertyOptional({ example: 'I enjoy finding local food and quiet walks.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  aboutMe?: string;

  @ApiPropertyOptional({ example: 'Medina of Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationLocationName?: string;

  @ApiPropertyOptional({ example: 36.8065 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  organizationLatitude?: number;

  @ApiPropertyOptional({ example: 10.1815 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  organizationLongitude?: number;

  @ApiPropertyOptional({ type: [Number], example: [1, 4, 7] })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map(Number).filter(Number.isInteger);
    }
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  interests?: number[];

  @ApiPropertyOptional({
    example: 'PAR',
    nullable: true,
    description:
      'Home airport or city (IATA code) for flight search. Empty string or null clears it.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  )
  @ValidateIf((_o, value) => value !== null)
  @Matches(/^[A-Z]{3}$/, { message: 'homeAirportCode must be a 3-letter IATA code' })
  homeAirportCode?: string | null;
}
