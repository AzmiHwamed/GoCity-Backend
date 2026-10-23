import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../../common/dto/paginated-response.dto';
import { CurrentUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { CurrentTripRole, TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { InviteLinkDto, InvitePreviewDto, JoinResultDto } from '../dto/member.dto';
import {
  BrowseTripsDto,
  CopyTripDto,
  MyTripsQueryDto,
  PublicTripDto,
  ShareInfoDto,
  UpdateVisibilityDto,
} from '../dto/sharing.dto';
import { CreateTripDto, UpdateTripDto } from '../dto/trip.dto';
import { Trip } from '../entities/trip.entity';
import { TripMembersService } from '../services/trip-members.service';
import { TripsService } from '../services/trips.service';
import { TripMemberRole } from '../trip.enums';
import { ResponseTitle } from '../../../common/response/api-response';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly membersService: TripMembersService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a trip (you become its owner)' })
  @ApiCreatedResponse({ type: Trip })
  @ResponseTitle('Trip created')
  create(@CurrentUser('id') userId: number, @Body() dto: CreateTripDto): Promise<Trip> {
    return this.tripsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Trips I own or am a member of (with myRole)',
    description: 'Same as GET /users/me/trips. Filter with role and when=upcoming|past.',
  })
  @ResponseTitle('Trips fetched')
  findMine(
    @CurrentUser() user: AuthUser,
    @Query() query: MyTripsQueryDto,
  ): Promise<Paginated<Trip>> {
    return this.tripsService.findMine(user, query);
  }

  // ── Other people's trips (read-only). Declared before ':tripId'. ──

  @Get('public')
  @ApiOperation({
    summary: 'Browse public trips',
    description: 'Search by name (q), filter by dates (from/to), sort by newest or start_date.',
  })
  @ResponseTitle('Public trips fetched')
  browsePublic(
    @Query() query: BrowseTripsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Paginated<PublicTripDto>> {
    return this.tripsService.browsePublic(query, user);
  }

  @Get('public/:tripId')
  @ApiOperation({ summary: 'View a public trip with its activities (read-only)' })
  @ApiOkResponse({ type: PublicTripDto })
  @ApiNotFoundResponse({ description: 'Not found, or not public' })
  @ResponseTitle('Trip fetched')
  viewPublic(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<PublicTripDto> {
    return this.tripsService.viewPublic(tripId, user);
  }

  @Get('shared/:shareCode')
  @ApiOperation({
    summary: 'View a trip through its share link (read-only)',
    description: 'Works while the trip is link or public. Does not make you a member.',
  })
  @ApiOkResponse({ type: PublicTripDto })
  @ApiNotFoundResponse({ description: 'Invalid link, or the trip is private again' })
  @ResponseTitle('Shared trip fetched')
  viewShared(
    @Param('shareCode') shareCode: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PublicTripDto> {
    return this.tripsService.viewShared(shareCode, user);
  }

  // ── Invite link (for the person who received it) ──────────

  @Get('invite/:code')
  @ApiOperation({ summary: 'Preview the trip behind an invite link' })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ApiNotFoundResponse({ description: 'Invalid or reset link' })
  @ResponseTitle('Invite preview fetched')
  previewInvite(
    @Param('code') code: string,
    @CurrentUser('id') userId: number,
  ): Promise<InvitePreviewDto> {
    return this.membersService.preview(code, userId);
  }

  @Post('invite/:code/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a trip through its invite link (as editor)' })
  @ApiOkResponse({ type: JoinResultDto })
  @ResponseTitle('Joined trip')
  joinByInvite(
    @Param('code') code: string,
    @CurrentUser('id') userId: number,
  ): Promise<JoinResultDto> {
    return this.membersService.joinByCode(code, userId);
  }

  // ── One trip ──────────────────────────────────────────────

  @Get(':tripId')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({ summary: 'Get a trip (members only)' })
  @ApiOkResponse({ type: Trip })
  @ResponseTitle('Trip fetched')
  findOne(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentTripRole() role: TripMemberRole,
  ): Promise<Trip> {
    return this.tripsService.findOne(tripId, role);
  }


  @Patch(':tripId')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Update trip details (editor or owner)' })
  @ApiOkResponse({ type: Trip })
  @ResponseTitle('Trip updated')
  update(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: UpdateTripDto,
    @CurrentTripRole() role: TripMemberRole,
  ): Promise<Trip> {
    return this.tripsService.update(tripId, dto, role);
  }

  @Delete(':tripId')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a trip and everything in it (owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Trip deleted')
  remove(@Param('tripId', ParseIntPipe) tripId: number): Promise<void> {
    return this.tripsService.remove(tripId);
  }

  @Get(':tripId/invite-link')
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({ summary: 'Get the invite link (owner)' })
  @ApiOkResponse({ type: InviteLinkDto })
  @ResponseTitle('Invite link fetched')
  getInviteLink(@Param('tripId', ParseIntPipe) tripId: number): Promise<InviteLinkDto> {
    return this.tripsService.getInviteLink(tripId);
  }

  @Post(':tripId/invite-link/regenerate')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make a new invite link; the old one stops working (owner)' })
  @ApiOkResponse({ type: InviteLinkDto })
  @ResponseTitle('Invite link regenerated')
  regenerateInviteLink(@Param('tripId', ParseIntPipe) tripId: number): Promise<InviteLinkDto> {
    return this.tripsService.regenerateInviteLink(tripId);
  }

  // ── Publishing (read-only share link, separate from the invite link) ──

  @Patch(':tripId/visibility')
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({
    summary: 'Publish or unpublish the trip (owner)',
    description:
      'private = members only · link = anyone with the share link · public = listed for everyone. Returns the share link.',
  })
  @ApiOkResponse({ type: ShareInfoDto })
  @ResponseTitle('Visibility updated')
  setVisibility(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: UpdateVisibilityDto,
  ): Promise<ShareInfoDto> {
    return this.tripsService.setVisibility(tripId, dto.visibility);
  }

  @Get(':tripId/share-link')
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({ summary: 'Get the read-only share link (owner)' })
  @ApiOkResponse({ type: ShareInfoDto })
  @ResponseTitle('Share link fetched')
  getShareLink(@Param('tripId', ParseIntPipe) tripId: number): Promise<ShareInfoDto> {
    return this.tripsService.getShareInfo(tripId);
  }

  @Post(':tripId/share-link/regenerate')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make a new share link; the old one stops working (owner)' })
  @ApiOkResponse({ type: ShareInfoDto })
  @ResponseTitle('Share link regenerated')
  regenerateShareLink(@Param('tripId', ParseIntPipe) tripId: number): Promise<ShareInfoDto> {
    return this.tripsService.regenerateShareCode(tripId);
  }

  // ── Copying ───────────────────────────────────────────────

  @Post(':tripId/copy')
  @ApiOperation({
    summary: 'Copy a trip into a new private trip of your own',
    description:
      'Works for trips you belong to, public trips, and link-shared trips (send shareCode). ' +
      'Copies the details, hotel and all activities/plans; not members, invitations, ideas or images. ' +
      'Optionally give a new name and startDate (the length stays the same).',
  })
  @ApiCreatedResponse({ type: Trip })
  @ResponseTitle('Trip copied')
  copy(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CopyTripDto,
  ): Promise<Trip> {
    return this.tripsService.copy(tripId, user, dto);
  }
}
