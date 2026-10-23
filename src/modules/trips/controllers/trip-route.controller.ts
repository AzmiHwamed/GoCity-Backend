import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseTitle } from '../../../common/response/api-response';
import { CurrentUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { DayRouteDto, DayRouteQueryDto } from '../dto/route.dto';
import { TripRouteService } from '../services/trip-route.service';

@ApiTags('Trip route')
@ApiBearerAuth()
@Controller('trips/:tripId/route')
export class TripRouteController {
  constructor(private readonly route: TripRouteService) {}

  @Get()
  @ApiOperation({
    summary: "A day's route between its activities (Google Routes)",
    description:
      'Activities in start-time order (at the meeting point when set, otherwise the place), ' +
      'with a route, time and distance for each leg using the travel mode of the activity you ' +
      'are going to. includeHotel=true starts and ends the day at the hotel. Members, and anyone ' +
      'who can see a shared trip, can use it. Legs are cached for a day.',
  })
  @ApiOkResponse({ type: DayRouteDto })
  @ResponseTitle('Route fetched')
  dayRoute(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
    @Query() query: DayRouteQueryDto,
  ): Promise<DayRouteDto> {
    return this.route.dayRoute(tripId, user, query);
  }
}
