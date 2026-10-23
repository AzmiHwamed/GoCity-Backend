import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ActivityDetailsDto } from '../../trips/dto/activity.dto';
import { OrganizationProgramType } from '../entities/organization-program.entity';

export const PROGRAM_DIFFICULTIES = ['easy', 'moderate', 'challenging'] as const;

export class CreateOrganizationProgramDto {
  @ApiProperty({ enum: OrganizationProgramType })
  @IsEnum(OrganizationProgramType)
  programType: OrganizationProgramType;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) destination?: string | null;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;
  @ApiPropertyOptional({
    type: ActivityDetailsDto,
    description: 'Required for an activity program',
  })
  @ValidateIf((o) => o.programType === OrganizationProgramType.ACTIVITY)
  @IsObject()
  activity?: ActivityDetailsDto;
  @ApiPropertyOptional({ type: [ActivityDetailsDto], description: 'Required for a trip program' })
  @ValidateIf((o) => o.programType === OrganizationProgramType.TRIP)
  @IsArray()
  @ArrayMaxSize(100)
  itinerary?: ActivityDetailsDto[];
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isPublished?: boolean;

  @ApiPropertyOptional({ example: 'Food & drink' }) @IsOptional() @IsString() @MaxLength(80) category?: string | null;
  @ApiPropertyOptional({ example: 45, description: 'Price per person' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;
  @ApiPropertyOptional({ example: 'EUR' }) @IsOptional() @IsString() @Length(3, 3) currency?: string | null;
  @ApiPropertyOptional({ enum: PROGRAM_DIFFICULTIES })
  @IsOptional()
  @IsIn(PROGRAM_DIFFICULTIES)
  difficulty?: (typeof PROGRAM_DIFFICULTIES)[number] | null;
  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxGroupSize?: number | null;
  @ApiPropertyOptional({ type: [String], example: ['English', 'French'] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true })
  languages?: string[] | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(300, { each: true })
  highlights?: string[] | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true })
  included?: string[] | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true })
  excluded?: string[] | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(300, { each: true })
  whatToBring?: string[] | null;
  @ApiPropertyOptional({ example: 'Bab El Bhar gate, Tunis' }) @IsOptional() @IsString() @MaxLength(255) meetingPoint?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) cancellationPolicy?: string | null;
  @ApiPropertyOptional({ example: 'https://example.com/book' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  bookingUrl?: string | null;
}

export class SetProgramCoverDto {
  @ApiProperty({ description: 'Id of one of this program’s images' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  imageId: number;
}

export class UpdateOrganizationProgramDto extends PartialType(CreateOrganizationProgramDto) {}

export class ApplyProgramDto {
  @ApiProperty({ description: 'A trip you own or can edit' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetTripId: number;
  @ApiPropertyOptional({ example: 1, description: 'First day to add the program to' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startDay?: number;
  @ApiPropertyOptional({
    example: '14:30',
    description: 'Overrides the time for a single-activity program',
  })
  @IsOptional()
  @IsString()
  startTime?: string;
  @ApiPropertyOptional({
    example: '16:00',
    description: 'Overrides the time for a single-activity program',
  })
  @IsOptional()
  @IsString()
  endTime?: string;
}
