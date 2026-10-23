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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../../auth/decorators';
import { CurrentTripRole, TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { CreateIdeaDto, VoteDto } from '../dto/idea.dto';
import { TripIdea } from '../entities/trip-idea.entity';
import { TripIdeasService } from '../services/trip-ideas.service';
import { TripMessagesService } from '../services/trip-messages.service';
import { TripChatGateway } from '../trip-chat.gateway';
import { IdeaStatus, TripMemberRole } from '../trip.enums';
import { ResponseTitle } from '../../../common/response/api-response';

class IdeaQueryDto {
  @ApiPropertyOptional({ enum: IdeaStatus })
  @IsOptional()
  @IsEnum(IdeaStatus)
  status?: IdeaStatus;
}

/** All members (viewers too) can propose and vote. */
@ApiTags('Trip ideas')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@TripRole(TripMemberRole.VIEWER)
@Controller('trips/:tripId/ideas')
export class TripIdeasController {
  constructor(private readonly ideasService: TripIdeasService, private readonly messages: TripMessagesService, private readonly chat: TripChatGateway) {}

  @Post()
  @ApiOperation({
    summary: 'Propose an activity idea',
    description:
      'Your own vote counts as yes. When more than half of the members vote yes, it becomes an activity.',
  })
  @ApiCreatedResponse({ type: TripIdea })
  @ResponseTitle('Idea proposed')
  async create(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateIdeaDto,
  ): Promise<TripIdea> {
    const idea = await this.ideasService.create(tripId, userId, dto);
    const message = await this.messages.create(tripId, userId, undefined, undefined, undefined, idea.id);
    this.chat.emitMessage(tripId, message);
    return idea;
  }

  @Get()
  @ApiOperation({ summary: 'List ideas with vote counts and my vote' })
  @ApiOkResponse({ type: [TripIdea] })
  @ResponseTitle('Ideas fetched')
  findAll(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Query() query: IdeaQueryDto,
  ): Promise<TripIdea[]> {
    return this.ideasService.findAll(tripId, userId, query.status);
  }

  @Get(':ideaId')
  @ApiOkResponse({ type: TripIdea })
  @ResponseTitle('Idea fetched')
  findOne(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('ideaId', ParseIntPipe) ideaId: number,
    @CurrentUser('id') userId: number,
  ): Promise<TripIdea> {
    return this.ideasService.findOne(tripId, ideaId, userId);
  }

  @Put(':ideaId/vote')
  @ApiOperation({ summary: 'Vote yes/no (or change your vote) while the idea is open' })
  @ApiOkResponse({ type: TripIdea })
  @ResponseTitle('Vote recorded')
  async vote(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('ideaId', ParseIntPipe) ideaId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: VoteDto,
  ): Promise<TripIdea> {
    const idea = await this.ideasService.vote(tripId, ideaId, userId, dto.value);
    const messages = await this.messages.findBySharedIdea(tripId, ideaId);
    messages.forEach((message) => this.chat.emitMessage(tripId, message));
    return idea;
  }

  @Delete(':ideaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw an open idea (proposer or owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Idea deleted')
  remove(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('ideaId', ParseIntPipe) ideaId: number,
    @CurrentUser('id') userId: number,
    @CurrentTripRole() role: TripMemberRole,
  ): Promise<void> {
    return this.ideasService.remove(tripId, ideaId, userId, role);
  }
}
