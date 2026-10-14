import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { ToLowerTrim } from '../../../common/validators';
import { INVITABLE_ROLES, InvitableRole, TripMemberRole } from '../trip.enums';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: INVITABLE_ROLES, example: TripMemberRole.EDITOR })
  @IsIn(INVITABLE_ROLES)
  role: InvitableRole;
}

export class TransferOwnershipDto {
  @ApiProperty({ example: 2, description: 'User id of an existing member' })
  @IsInt()
  @Min(1)
  userId: number;
}

/** Invite either by email or by user id (find ids with GET /users/search). */
export class CreateInvitationDto {
  @ApiPropertyOptional({ example: 'friend@example.com', description: 'Use this or userId' })
  @ValidateIf((o: CreateInvitationDto) => o.userId === undefined)
  @IsEmail()
  @ToLowerTrim()
  email?: string;

  @ApiPropertyOptional({ example: 2, description: 'Use this or email' })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional({ enum: INVITABLE_ROLES, default: TripMemberRole.VIEWER })
  @IsOptional()
  @IsIn(INVITABLE_ROLES)
  role?: InvitableRole;
}

export class InviteLinkDto {
  @ApiProperty({ example: 'q3ZfK1x9TQe' })
  code: string;

  @ApiProperty({ example: 'http://localhost:3000/invite/q3ZfK1x9TQe' })
  url: string;

  @ApiProperty({ enum: [TripMemberRole.EDITOR], description: 'Role given to people who join' })
  role: TripMemberRole;
}

export class InvitePreviewDto {
  @ApiProperty() tripId: number;
  @ApiProperty() name: string;
  @ApiProperty() startDate: string;
  @ApiProperty() endDate: string;
  @ApiProperty() durationDays: number;
  @ApiProperty({ example: 'Jane Doe' }) ownerName: string;
  @ApiProperty() memberCount: number;
  @ApiProperty({ description: 'True if you are already a member' }) alreadyMember: boolean;
}

export class JoinResultDto {
  @ApiProperty() tripId: number;
  @ApiProperty({ enum: TripMemberRole }) role: TripMemberRole;
  @ApiProperty({ description: 'True if you were already a member (nothing changed)' })
  alreadyMember: boolean;
}
