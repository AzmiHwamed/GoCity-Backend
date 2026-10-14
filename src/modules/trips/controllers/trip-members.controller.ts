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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators';
import { TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { TransferOwnershipDto, UpdateMemberRoleDto } from '../dto/member.dto';
import { TripMember } from '../entities/trip-member.entity';
import { TripMembersService } from '../services/trip-members.service';
import { TripMemberRole } from '../trip.enums';
import { ResponseTitle } from '../../../common/response/api-response';

@ApiTags('Trip members')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips/:tripId')
export class TripMembersController {
  constructor(private readonly membersService: TripMembersService) {}

  @Get('members')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({ summary: 'List members and their roles' })
  @ApiOkResponse({ type: [TripMember] })
  @ResponseTitle('Members fetched')
  findAll(@Param('tripId', ParseIntPipe) tripId: number): Promise<TripMember[]> {
    return this.membersService.findAll(tripId);
  }

  @Patch('members/:userId')
  @TripRole(TripMemberRole.OWNER)
  @ApiOperation({ summary: "Change a member's role to editor or viewer (owner)" })
  @ApiOkResponse({ type: TripMember })
  @ResponseTitle('Member role updated')
  updateRole(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<TripMember> {
    return this.membersService.updateRole(tripId, userId, dto.role);
  }

  @Delete('members/:userId')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Member removed')
  remove(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<void> {
    return this.membersService.remove(tripId, userId);
  }

  @Post('leave')
  @TripRole(TripMemberRole.VIEWER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave the trip (the owner must transfer ownership first)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Left trip')
  leave(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
  ): Promise<void> {
    return this.membersService.leave(tripId, userId);
  }

  @Post('transfer-ownership')
  @TripRole(TripMemberRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make another member the owner; you become an editor (owner)' })
  @ApiOkResponse({ type: [TripMember] })
  @ResponseTitle('Ownership transferred')
  transferOwnership(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: TransferOwnershipDto,
  ): Promise<TripMember[]> {
    return this.membersService.transferOwnership(tripId, dto.userId);
  }
}
