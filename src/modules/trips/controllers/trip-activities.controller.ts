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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators';
import { TripRole, TripRoleGuard } from '../access/trip-role.guard';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { ActivityDetailsDto, QueryActivitiesDto, UpdateActivityDto } from '../dto/activity.dto';
import { CopyActivityDto } from '../dto/sharing.dto';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripActivitiesService } from '../services/trip-activities.service';
import { TripMemberRole } from '../trip.enums';
import { ResponseTitle } from '../../../common/response/api-response';

@ApiTags('Trip activities')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips/:tripId/activities')
export class TripActivitiesController {
  constructor(private readonly activitiesService: TripActivitiesService) {}

  @Get()
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({ summary: 'List activities and plans, by day then start time' })
  @ApiOkResponse({ type: [TripActivity] })
  @ResponseTitle('Activities fetched')
  findAll(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query() query: QueryActivitiesDto,
  ): Promise<TripActivity[]> {
    return this.activitiesService.findAll(tripId, query.day);
  }

  @Get(':activityId')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOkResponse({ type: TripActivity })
  @ResponseTitle('Activity fetched')
  findOne(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('activityId', ParseIntPipe) activityId: number,
  ): Promise<TripActivity> {
    return this.activitiesService.findOne(tripId, activityId);
  }

  @Post()
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Add an activity or plan (editor or owner)' })
  @ApiCreatedResponse({ type: TripActivity })
  @ResponseTitle('Activity created')
  create(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ActivityDetailsDto,
  ): Promise<TripActivity> {
    return this.activitiesService.create(tripId, userId, dto);
  }

  @Patch(':activityId')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Update an activity (editor or owner)' })
  @ApiOkResponse({ type: TripActivity })
  @ResponseTitle('Activity updated')
  update(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body() dto: UpdateActivityDto,
  ): Promise<TripActivity> {
    return this.activitiesService.update(tripId, activityId, dto);
  }

  @Post(':activityId/copy')
  @ApiOperation({
    summary: 'Copy this activity into one of your trips',
    description:
      'You need to be able to see this trip (member, public, or shareCode for link-shared trips) ' +
      'and be editor or owner of the target trip. dayNumber defaults to the same day.',
  })
  @ApiCreatedResponse({ type: TripActivity })
  @ResponseTitle('Activity copied')
  copy(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CopyActivityDto,
  ): Promise<TripActivity> {
    return this.activitiesService.copyTo(tripId, activityId, user, dto);
  }

  @Delete(':activityId')
  @TripRole(TripMemberRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an activity (editor or owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Activity deleted')
  remove(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('activityId', ParseIntPipe) activityId: number,
  ): Promise<void> {
    return this.activitiesService.remove(tripId, activityId);
  }
}
