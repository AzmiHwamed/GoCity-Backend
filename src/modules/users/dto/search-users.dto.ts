import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { User, UserRole } from '../entities/user.entity';

export class SearchUsersDto {
  @ApiProperty({
    example: 'jo sm',
    description:
      'Part of a first name, last name, organization or email. Several words must all match.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({
    example: 7,
    description: "Leave out this trip's current members (for invites)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  excludeTripId?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/** Public card for a user: no email, phone or other private fields. */
export class UserSummaryDto {
  @ApiProperty({ example: 2 }) id: number;
  @ApiProperty({ example: 'Jane' }) firstName: string;
  @ApiProperty({ example: 'Doe' }) lastName: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiPropertyOptional({ nullable: true }) organizationName: string | null;
  @ApiPropertyOptional({ example: '/files/3f2a...png', nullable: true }) avatarUrl: string | null;
}

export class UserSearchResultDto extends UserSummaryDto {
  @ApiProperty({
    example: 'ja***@gmail.com',
    description: 'Masked, unless your query was this exact email address',
  })
  email: string;
}

export function toUserSummary(user: User): UserSummaryDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationName: user.organizationName,
    avatarUrl: user.avatar?.url ?? null,
  };
}

/** jane.doe@gmail.com → ja***@gmail.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${domain}`;
}

/** Escapes %, _ and \ so user input is matched literally inside LIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
