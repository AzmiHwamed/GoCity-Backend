import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { CreateInvitationDto, JoinResultDto } from '../dto/member.dto';
import { TripInvitation } from '../entities/trip-invitation.entity';
import { TripInvitationsService } from '../services/trip-invitations.service';
import { InvitationStatus, TripMemberRole } from '../trip.enums';
import { ResponseTitle } from '../../../common/response/api-response';

class InvitationQueryDto {
  @ApiPropertyOptional({ enum: InvitationStatus })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}

/** Managing a trip's invitations (owner). */
@ApiTags('Trip invitations')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips/:tripId/invitations')
export class TripInvitationsController {
  constructor(private readonly invitationsService: TripInvitationsService) {}

  @Post()
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({
    summary: 'Invite someone by email or user id, as editor or viewer (owner)',
    description:
      'Find user ids with GET /users/search. Emails without an account are matched when that person signs up.',
  })
  @ApiCreatedResponse({ type: TripInvitation })
  @ApiConflictResponse({ description: 'Already a member, or already invited' })
  @ResponseTitle('Invitation sent')
  send(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ): Promise<TripInvitation> {
    return this.invitationsService.send(tripId, user, dto);
  }

  @Get()
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({ summary: "List the trip's invitations (owner)" })
  @ApiOkResponse({ type: [TripInvitation] })
  @ResponseTitle('Invitations fetched')
  findAll(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query() query: InvitationQueryDto,
  ): Promise<TripInvitation[]> {
    return this.invitationsService.findForTrip(tripId, query.status);
  }

  @Delete(':invitationId')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending invitation (owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Invitation revoked')
  revoke(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<void> {
    return this.invitationsService.revoke(tripId, invitationId);
  }
}

/** Invitations addressed to me. */
@ApiTags('Trip invitations')
@ApiBearerAuth()
@Controller('invitations')
export class MyInvitationsController {
  constructor(private readonly invitationsService: TripInvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'My pending trip invitations' })
  @ApiOkResponse({ type: [TripInvitation] })
  @ResponseTitle('Invitations fetched')
  findMine(@CurrentUser() user: AuthUser): Promise<TripInvitation[]> {
    return this.invitationsService.findMine(user);
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation and join the trip' })
  @ApiOkResponse({ type: JoinResultDto })
  @ResponseTitle('Invitation accepted')
  accept(
    @Param('invitationId', ParseIntPipe) invitationId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<JoinResultDto> {
    return this.invitationsService.accept(invitationId, user);
  }

  @Post(':invitationId/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline an invitation' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Invitation declined')
  decline(
    @Param('invitationId', ParseIntPipe) invitationId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.invitationsService.decline(invitationId, user);
  }
}
