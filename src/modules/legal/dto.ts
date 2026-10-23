import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LegalType } from './entities/legal-document.entity';

export class PublishLegalDto {
  @ApiProperty({ example: '1.1', description: 'Unique per document, e.g. 1.1 or 2026-11' })
  @IsString()
  @Matches(/^[\w.-]{1,20}$/, { message: 'version: up to 20 letters, digits, dots or dashes' })
  version: string;

  @ApiPropertyOptional({ example: 'Privacy Policy', description: 'Defaults to the current title' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title?: string;

  @ApiProperty({ description: 'Markdown' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  content: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString({ strict: true })
  effectiveDate?: string;
}

/**
 * Edits a version in place (typos, placeholders, formatting). The version number stays, so users
 * are not asked to accept again; publish a new version for changes they must accept.
 */
export class UpdateLegalDto extends PartialType(OmitType(PublishLegalDto, ['version'] as const)) {}

export class AcceptLegalDto {
  @ApiPropertyOptional({
    enum: LegalType,
    isArray: true,
    description: 'Which documents to accept (current versions). Defaults to both.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(LegalType, { each: true })
  types?: LegalType[];
}

/** A version in the history list (no content). */
export class LegalVersionDto {
  @ApiProperty() version: string;
  @ApiProperty() title: string;
  @ApiProperty() effectiveDate: string;
  @ApiProperty() isCurrent: boolean;
  @ApiProperty() createdAt: Date;
}

export class LegalAcceptanceDto {
  @ApiPropertyOptional({ nullable: true, example: '1.0' }) currentVersion: string | null;
  @ApiPropertyOptional({ nullable: true, example: '1.0' }) acceptedVersion: string | null;
  @ApiPropertyOptional({ nullable: true }) acceptedAt: Date | null;
  @ApiProperty({ description: 'True when the current version is not the one you accepted' })
  needsAcceptance: boolean;
}

/** Where the logged-in user stands with the current terms and privacy policy. */
export class LegalStatusDto {
  @ApiProperty({ type: LegalAcceptanceDto }) terms: LegalAcceptanceDto;
  @ApiProperty({ type: LegalAcceptanceDto }) privacy: LegalAcceptanceDto;
  @ApiProperty({ description: 'terms.needsAcceptance || privacy.needsAcceptance' })
  needsAcceptance: boolean;
}
