import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ResponseTitle } from '../../../common/response/api-response';
import { CurrentUser } from '../../auth/decorators';
import { TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { CreateTripMessageDto } from '../dto/message.dto';
import { TripMessage } from '../entities/trip-message.entity';
import { TripChatGateway } from '../trip-chat.gateway';
import { TripMemberRole } from '../trip.enums';
import { TripMessagesService } from '../services/trip-messages.service';

class MessagesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

@ApiTags('Trip chat')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@TripRole(TripMemberRole.VIEWER)
@Controller('trips/:tripId/messages')
export class TripMessagesController {
  constructor(private readonly messages: TripMessagesService, private readonly chat: TripChatGateway) {}

  @Get()
  @ApiOkResponse({ type: [TripMessage] })
  @ResponseTitle('Trip messages fetched')
  findRecent(@Param('tripId', ParseIntPipe) tripId: number, @Query() query: MessagesQueryDto) {
    return this.messages.findRecent(tripId, query.limit);
  }

  @Get('read-state')
  @ResponseTitle('Trip chat read state fetched')
  readState(@Param('tripId', ParseIntPipe) tripId: number, @CurrentUser('id') userId: number) {
    return this.messages.readState(tripId, userId);
  }

  @Patch('read')
  @ResponseTitle('Trip chat marked read')
  markRead(@Param('tripId', ParseIntPipe) tripId: number, @CurrentUser('id') userId: number) {
    return this.messages.markRead(tripId, userId);
  }

  @Post()
  @ApiCreatedResponse({ type: TripMessage })
  @ResponseTitle('Trip message sent')
  async create(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateTripMessageDto,
  ): Promise<TripMessage> {
    const message = await this.messages.create(tripId, userId, dto.content, dto.sharedTripId, dto.sharedActivityId, dto.sharedIdeaId);
    this.chat.emitMessage(tripId, message);
    return message;
  }
}
